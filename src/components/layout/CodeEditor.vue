<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands'
import { search, openSearchPanel } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'

const props = defineProps<{
  modelValue: string
  fileName: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { t, locale } = useI18n()
const editorContainer = ref<HTMLElement | null>(null)
let view: EditorView | null = null
const phrasesCompartment = new Compartment()

const LARGE_FILE_LEN = 5 * 1024 * 1024

// 构建 CodeMirror 6 多语言短语对象
const getCmPhrases = () => {
  return EditorState.phrases.of({
    'Find': t('cm.Find'),
    'Replace': t('cm.Replace'),
    'next': t('cm.next'),
    'previous': t('cm.previous'),
    'all': t('cm.all'),
    'match case': t('cm.match case'),
    'by word': t('cm.by word'),
    'regexp': t('cm.regexp'),
    'replace': t('cm.replace'),
    'replace all': t('cm.replace all'),
    'close': t('cm.close')
  })
}

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
    basicSetup,
    phrasesCompartment.of(getCmPhrases()),
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
      },
      '.cm-panels': {
        backgroundColor: 'hsl(var(--muted))',
        color: 'hsl(var(--foreground))',
        borderBottom: '1px solid hsl(var(--border))'
      },
      '.cm-search': {
        padding: '6px 10px',
        fontSize: '12px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px'
      },
      '.cm-textfield': {
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '0px',
        padding: '2px 6px',
        outline: 'none'
      },
      '.cm-button': {
        backgroundImage: 'none',
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '0px',
        padding: '2px 8px',
        cursor: 'pointer'
      },
      '.cm-button:hover': {
        backgroundColor: 'hsl(var(--accent))'
      },
      '.cm-panel.cm-search button[name="close"]': {
        color: 'hsl(var(--muted-foreground))',
        fontSize: '16px',
        top: '4px',
        right: '8px'
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

// 监听全局语言切换，实时刷新 CodeMirror 面板语言
watch(locale, () => {
  if (view) {
    view.dispatch({
      effects: phrasesCompartment.reconfigure(getCmPhrases())
    })
  }
})

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

const copy = async () => {
  if (!view) return
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to)
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

const openFind = () => {
  if (!view) return
  openSearchPanel(view)
  requestAnimationFrame(() => {
    const input = view?.dom.querySelector<HTMLInputElement>('.cm-textfield[name="search"]')
    input?.focus()
    input?.select()
  })
}

const openReplace = () => {
  if (!view) return
  openSearchPanel(view)
  requestAnimationFrame(() => {
    const input = view?.dom.querySelector<HTMLInputElement>('.cm-textfield[name="replace"]')
    input?.focus()
    input?.select()
  })
}

defineExpose({ undo, redo, cut, copy, paste, openFind, openReplace })
</script>

<template>
  <div ref="editorContainer" class="h-full w-full overflow-hidden bg-background" />
</template>

<style scoped>
:deep(.cm-editor) { height: 100%; }
:deep(.cm-scroller) { overflow: auto; }
</style>
