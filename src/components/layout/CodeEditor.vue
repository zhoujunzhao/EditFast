<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Prec, type Extension } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands'
import {
  search,
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll
} from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'

export interface SearchOptions {
  search: string
  replace: string
  caseSensitive: boolean
  wholeWord: boolean
  regexp: boolean
}

const props = defineProps<{
  modelValue: string
  fileName: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const editorContainer = ref<HTMLElement | null>(null)
let view: EditorView | null = null

const LARGE_FILE_LEN = 5 * 1024 * 1024

const getLanguageExtension = (name: string): Extension[] => {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'js' || ext === 'ts') return [javascript({ typescript: ext === 'ts' })]
  if (ext === 'json') return [json()]
  return [markdown()]
}

const initEditor = () => {
  if (!editorContainer.value) return
  if (view) view.destroy()

  const isLargeFile = props.modelValue.length > LARGE_FILE_LEN

  const extensions: Extension[] = [
    // 最高优先级拦截 Mod-f / Mod-h，防止弹出 CodeMirror 内置搜索栏，交给外部自定义弹窗处理
    Prec.highest(
        keymap.of([
          { key: 'Mod-f', run: () => false, preventDefault: true },
          { key: 'Mod-h', run: () => false, preventDefault: true }
        ])
    ),
    basicSetup,
    search({ top: true }),
    ...(isLargeFile ? [] : [...getLanguageExtension(props.fileName), EditorView.lineWrapping]),
    EditorView.theme({
      '&': { height: '100%', fontSize: '14px' },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: '1px solid hsl(var(--border))'
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString())
      }
    })
  ]

  const state = EditorState.create({
    doc: props.modelValue,
    extensions
  })

  view = new EditorView({
    state,
    parent: editorContainer.value
  })
}

onMounted(() => initEditor())
onBeforeUnmount(() => view?.destroy())

watch(() => props.modelValue, (newVal) => {
  if (view && newVal !== view.state.doc.toString()) {
    if (view.state.doc.length === 0 && newVal.length > LARGE_FILE_LEN) {
      initEditor()
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newVal }
    })
  }
})

const undo = () => { if (view) { cmUndo(view); view.focus() } }
const redo = () => { if (view) { cmRedo(view); view.focus() } }

const getSelectedText = () => {
  if (!view) return ''
  const { from, to } = view.state.selection.main
  return view.state.sliceDoc(from, to)
}

const copy = async () => {
  if (!view) return
  const text = getSelectedText()
  if (text) await writeText(text)
  view.focus()
}

const cut = async () => {
  if (!view) return
  const { from, to } = view.state.selection.main
  if (from === to) { view.focus(); return }
  const text = view.state.sliceDoc(from, to)
  await writeText(text)
  view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } })
  view.focus()
}

const paste = async () => {
  if (!view) return
  try {
    const text = await readText()
    if (!text) return
    const { from, to } = view.state.selection.main
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
  } finally {
    view.focus()
  }
}

const syncSearchQuery = (opts: SearchOptions): { current: number; total: number } => {
  if (!view) return { current: 0, total: 0 }

  const query = new SearchQuery({
    search: opts.search,
    replace: opts.replace,
    caseSensitive: opts.caseSensitive,
    wholeWord: opts.wholeWord,
    regexp: opts.regexp
  })

  view.dispatch({ effects: setSearchQuery.of(query) })

  if (!opts.search || !query.valid) {
    return { current: 0, total: 0 }
  }

  let total = 0
  let current = 0
  const selFrom = view.state.selection.main.from
  const cursor = query.getCursor(view.state)

  for (let item = cursor.next(); !item.done; item = cursor.next()) {
    total++
    if (item.value.from <= selFrom) {
      current = total
    }
    if (total >= 10000) break
  }

  return { current, total }
}

const execFindNext = (opts: SearchOptions) => {
  if (!view) return { current: 0, total: 0 }
  syncSearchQuery(opts)
  findNext(view)
  return syncSearchQuery(opts)
}

const execFindPrev = (opts: SearchOptions) => {
  if (!view) return { current: 0, total: 0 }
  syncSearchQuery(opts)
  findPrevious(view)
  return syncSearchQuery(opts)
}

const execReplaceOne = (opts: SearchOptions) => {
  if (!view) return { current: 0, total: 0 }
  syncSearchQuery(opts)
  replaceNext(view)
  return syncSearchQuery(opts)
}

const execReplaceAll = (opts: SearchOptions) => {
  if (!view) return { current: 0, total: 0 }
  syncSearchQuery(opts)
  replaceAll(view)
  return syncSearchQuery(opts)
}

const clearSearch = () => {
  if (!view) return
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) })
}

defineExpose({
  undo,
  redo,
  cut,
  copy,
  paste,
  getSelectedText,
  syncSearchQuery,
  execFindNext,
  execFindPrev,
  execReplaceOne,
  execReplaceAll,
  clearSearch
})
</script>

<template>
  <div ref="editorContainer" class="h-full w-full overflow-hidden bg-background" />
</template>

<style scoped>
:deep(.cm-editor) { height: 100%; }
:deep(.cm-scroller) { overflow: auto; }
</style>
