<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { FolderDown } from '@lucide/vue'
import TopMenu from '@/components/layout/TopMenu.vue'
import TopToolBar from '@/components/layout/TopToolBar.vue'
import MiddleEdit from '@/components/layout/MiddleEdit.vue'
import StatusBar from '@/components/layout/StatusBar.vue'
import AboutDialog from '@/components/layout/AboutDialog.vue'
import FindReplaceDialog from '@/components/layout/FindReplaceDialog.vue'
import type { SearchOptions } from '@/components/layout/CodeEditor.vue'

const { t } = useI18n()
const middleEditRef = ref<InstanceType<typeof MiddleEdit> | null>(null)
const aboutOpen = ref(false)
const isDraggingOver = ref(false)

// 查找替换弹窗状态
const searchOpen = ref(false)
const searchShowReplace = ref(false)
const searchInitialText = ref('')
const searchMatchStat = ref({ current: 0, total: 0 })

const activeTabInfo = computed(() => middleEditRef.value?.currentTab ?? null)

// 打开自定义查找/替换弹窗
const openFindDialog = (withReplace = false) => {
  if (!activeTabInfo.value) return
  const selected = middleEditRef.value?.getActiveSelectedText() || ''
  if (selected && !selected.includes('\n')) {
    searchInitialText.value = selected
  }
  searchShowReplace.value = withReplace
  searchOpen.value = true
}

const handleSearchQuery = (opts: SearchOptions) => {
  searchMatchStat.value = middleEditRef.value?.syncSearchQuery(opts) || { current: 0, total: 0 }
}
const handleFindNext = (opts: SearchOptions) => {
  searchMatchStat.value = middleEditRef.value?.execFindNext(opts) || { current: 0, total: 0 }
}
const handleFindPrev = (opts: SearchOptions) => {
  searchMatchStat.value = middleEditRef.value?.execFindPrev(opts) || { current: 0, total: 0 }
}
const handleReplaceOne = (opts: SearchOptions) => {
  searchMatchStat.value = middleEditRef.value?.execReplaceOne(opts) || { current: 0, total: 0 }
}
const handleReplaceAll = (opts: SearchOptions) => {
  searchMatchStat.value = middleEditRef.value?.execReplaceAll(opts) || { current: 0, total: 0 }
}
const handleSearchClose = () => {
  middleEditRef.value?.clearSearch()
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase()
    if (key === 'n') {
      e.preventDefault()
      middleEditRef.value?.createNewTab()
    } else if (key === 'o') {
      e.preventDefault()
      middleEditRef.value?.openFile()
    } else if (key === 's') {
      e.preventDefault()
      if (e.altKey) middleEditRef.value?.saveAllFiles()
      else if (e.shiftKey) middleEditRef.value?.saveActiveFileAs()
      else middleEditRef.value?.saveActiveFile()
    } else if (key === 'f') {
      e.preventDefault()
      openFindDialog(false)
    } else if (key === 'h') {
      e.preventDefault()
      openFindDialog(true)
    }
  }
}

let unlistenClose: (() => void) | null = null
let unlistenDragDrop: (() => void) | null = null
let isClosing = false

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown, true)

  const appWindow = getCurrentWindow()
  unlistenClose = await appWindow.onCloseRequested(async (event) => {
    if (isClosing) return
    event.preventDefault()
    isClosing = true
    try {
      await middleEditRef.value?.flushAllCaches()
    } finally {
      await appWindow.destroy()
    }

  })

  const webview = getCurrentWebview()
  unlistenDragDrop = await webview.onDragDropEvent(async (event) => {
    const type = event.payload.type
    if (type === 'over' || type === 'enter') {
      isDraggingOver.value = true
    } else if (type === 'leave') {
      isDraggingOver.value = false
    } else if (type === 'drop') {
      isDraggingOver.value = false
      const paths = event.payload.paths
      if (Array.isArray(paths) && paths.length > 0) {
        await middleEditRef.value?.handleDroppedPaths(paths)
      }
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, true)
  if (unlistenClose) unlistenClose()
  if (unlistenDragDrop) unlistenDragDrop()
})
</script>

<template>
  <div class="relative flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground select-none">
    <header class="shrink-0">
      <top-menu
          :current-encoding="activeTabInfo?.encoding || 'UTF-8'"
          :has-active-tab="!!activeTabInfo"
          @new-file="middleEditRef?.createNewTab()"
          @open-file="middleEditRef?.openFile()"
          @save-file="middleEditRef?.saveActiveFile()"
          @save-as="middleEditRef?.saveActiveFileAs()"
          @change-encoding="(enc) => middleEditRef?.setActiveEncoding(enc)"
          @undo="middleEditRef?.undoActive()"
          @redo="middleEditRef?.redoActive()"
          @cut="middleEditRef?.cutActive()"
          @copy="middleEditRef?.copyActive()"
          @paste="middleEditRef?.pasteActive()"
          @find="openFindDialog(false)"
          @replace="openFindDialog(true)"
          @open-about="aboutOpen = true"
      />
      <top-tool-bar
          :has-active-tab="!!activeTabInfo"
          :has-dirty-tabs="!!middleEditRef?.hasDirtyTabs"
          @new-file="middleEditRef?.createNewTab()"
          @open-file="middleEditRef?.openFile()"
          @save-file="middleEditRef?.saveActiveFile()"
          @save-all="middleEditRef?.saveAllFiles()"
          @undo="middleEditRef?.undoActive()"
          @redo="middleEditRef?.redoActive()"
      />
    </header>

    <main class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <middle-edit ref="middleEditRef" />
    </main>

    <footer class="shrink-0 flex h-6 items-center justify-between border-t bg-muted/30 px-3 text-[11px] text-muted-foreground">
      <status-bar :active-tab-info="activeTabInfo" />
    </footer>

    <!-- 拖拽文件/文件夹悬停时的视觉引导遮罩 -->
    <div
        v-if="isDraggingOver"
        class="pointer-events-none absolute inset-2 z-50 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-primary bg-background/85 backdrop-blur-[1px]"
    >
      <FolderDown class="h-10 w-10 text-primary animate-bounce" />
      <p class="text-sm font-medium text-foreground">{{ t('tabs.dropHint') }}</p>
    </div>

    <!-- 自定义查找与替换浮动弹窗 -->
    <find-replace-dialog
        v-model:open="searchOpen"
        v-model:show-replace="searchShowReplace"
        :initial-text="searchInitialText"
        :match-stat="searchMatchStat"
        @query-change="handleSearchQuery"
        @find-next="handleFindNext"
        @find-prev="handleFindPrev"
        @replace-one="handleReplaceOne"
        @replace-all="handleReplaceAll"
        @close="handleSearchClose"
    />

    <about-dialog v-model:open="aboutOpen" />
  </div>
</template>
