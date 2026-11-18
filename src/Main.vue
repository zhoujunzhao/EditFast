<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import TopMenu from '@/components/layout/TopMenu.vue'
import TopToolBar from '@/components/layout/TopToolBar.vue'
import MiddleEdit from '@/components/layout/MiddleEdit.vue'
import StatusBar from '@/components/layout/StatusBar.vue'
import AboutDialog from '@/components/layout/AboutDialog.vue'

const middleEditRef = ref<InstanceType<typeof MiddleEdit> | null>(null)
const aboutOpen = ref(false)

const activeTabInfo = computed(() => middleEditRef.value?.currentTab ?? null)

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
      middleEditRef.value?.findActive()
    } else if (key === 'h') {
      e.preventDefault()
      middleEditRef.value?.replaceActive()
    }
  }
}

let unlistenClose: (() => void) | null = null
let isClosing = false;
onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  const appWindow = getCurrentWindow()
  unlistenClose = await appWindow.onCloseRequested(async (event) => {
    if (isClosing) return
    event.preventDefault()
    isClosing = true
    try {
      await middleEditRef.value?.flushAllCaches()
    } catch (e) {
      console.error('关闭前刷盘缓存失败:', e)
    } finally {
      await appWindow.destroy()
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (unlistenClose) unlistenClose()
})
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground select-none">
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
          @find="middleEditRef?.findActive()"
          @replace="middleEditRef?.replaceActive()"
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

    <about-dialog v-model:open="aboutOpen" />
  </div>
</template>
