<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
import { Scissors, CopyIcon, ClipboardPaste } from '@lucide/vue'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/components/ui/context-menu'

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

const { t } = useI18n()
const editorContainer = ref<HTMLElement | null>(null)
const hasSelection = ref(false)
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

  const docText = props.modelValue ?? ''
  const isLargeFile = docText.length > LARGE_FILE_LEN

  const extensions: Extension[] = [
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
        backgroundColor: 'var(--background)',
        color: 'var(--muted-foreground)',
        borderRight: '1px solid var(--border)',
        zIndex: '1'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--muted)'
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString())
      }
    })
  ]

  view = new EditorView({
    state: EditorState.create({
      doc: docText,
      extensions
    }),
    parent: editorContainer.value
  })
}

onMounted(() => {
  initEditor()
})

onBeforeUnmount(() => view?.destroy())

watch(
    () => props.modelValue,
    (newVal) => {
      const safeVal = newVal ?? ''
      if (!view) {
        initEditor()
        return
      }
      if (safeVal !== view.state.doc.toString()) {
        if (view.state.doc.length === 0 && safeVal.length > LARGE_FILE_LEN) {
          initEditor()
          return
        }
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: safeVal }
        })
      }
    },
    { flush: 'post' }
)

const refreshLayout = () => {
  if (view) {
    view.requestMeasure()
  }
}

const undo = () => { if (view) { cmUndo(view); view.focus() } }
const redo = () => { if (view) { cmRedo(view); view.focus() } }

const getSelectedText = () => {
  if (!view) return ''
  const { from, to } = view.state.selection.main
  return view.state.sliceDoc(from, to)
}

const handleContextMenuOpen = (isOpen: boolean) => {
  if (isOpen && view) {
    const { from, to } = view.state.selection.main
    hasSelection.value = from !== to
  }
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
  undo, redo, cut, copy, paste,
  getSelectedText, refreshLayout, syncSearchQuery,
  execFindNext, execFindPrev, execReplaceOne, execReplaceAll, clearSearch
})
</script>

<template>
  <ContextMenu @update:open="handleContextMenuOpen">
    <ContextMenuTrigger class="block h-full w-full overflow-hidden">
      <div ref="editorContainer" class="h-full w-full overflow-hidden bg-background select-text" />
    </ContextMenuTrigger>

    <ContextMenuContent class="w-40 rounded-none">
      <ContextMenuItem class="rounded-none text-xs" :disabled="!hasSelection" @click="cut">
        <Scissors class="h-3.5 w-3.5" />
        <span>{{ t('topMenu.edit.cut') }}</span>
        <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem class="rounded-none text-xs" :disabled="!hasSelection" @click="copy">
        <CopyIcon class="h-3.5 w-3.5" />
        <span>{{ t('topMenu.edit.copy') }}</span>
        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem class="rounded-none text-xs" @click="paste">
        <ClipboardPaste class="h-3.5 w-3.5" />
        <span>{{ t('topMenu.edit.paste') }}</span>
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>

<style scoped>
</style>
