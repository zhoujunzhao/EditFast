import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { message } from '@tauri-apps/plugin-dialog'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { loadSessionFromTemp, removeTabTempFile, type TabItem } from '@/utils/tabCache'
import { useTabSession } from './useTabSession'
import { useTabFileOps } from './useTabFileOps'

export function useEditorTabs() {
  const { t } = useI18n()
  const tabs = ref<TabItem[]>([])
  const activeTab = ref<string>('')
  const tabPosition = ref<'top' | 'bottom'>('top')

  const currentTab = computed(() => tabs.value.find(item => item.id === activeTab.value) || null)
  const hasDirtyTabs = computed(() => tabs.value.some(item => item.isDirty))

  const session = useTabSession(tabs, activeTab, tabPosition)
  const fileOps = useTabFileOps(tabs, activeTab, currentTab, session)

  let counter = 1
  const addTab = async () => {
    const newId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    tabs.value.push({
      id: newId,
      title: t('tabs.untitled', { num: counter++ }),
      content: '',
      filePath: null,
      isDirty: false,
      encoding: 'UTF-8',
      lastModified: null,
      fileSize: null
    })
    activeTab.value = newId
    await session.syncSession()
  }

  const moveTab = async (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= tabs.value.length ||
      toIndex >= tabs.value.length
    ) {
      return
    }
    const movedItem = tabs.value.splice(fromIndex, 1)[0]
    if (movedItem) {
      tabs.value.splice(toIndex, 0, movedItem)
      await session.syncSession()
    }
  }

  const removeTab = async (targetId: string, event?: MouseEvent) => {
    if (event) event.stopPropagation()
    const index = tabs.value.findIndex(item => item.id === targetId)
    if (index === -1) return

    const targetTab = tabs.value[index]
    if (!targetTab) return

    if (targetTab.isDirty) {
      const saveLabel = t('dialog.save')
      const cancelLabel = t('dialog.cancel')
      const action = await message(t('dialog.unsavedMessage', { title: targetTab.title }), {
        title: t('dialog.unsavedTitle'),
        kind: 'warning',
        buttons: { yes: saveLabel, no: t('dialog.dontSave'), cancel: cancelLabel }
      })
      if (action === 'Cancel' || action === cancelLabel) return
      if (action === 'Yes' || action === saveLabel) {
        if (!(await fileOps.saveTab(targetTab))) return
      }
    }

    fileOps.watcher.stop(targetId)
    if (activeTab.value === targetId) {
      const nextTab = tabs.value[index + 1] || (index > 0 ? tabs.value[index - 1] : undefined)
      activeTab.value = nextTab ? nextTab.id : ''
    }
    tabs.value.splice(index, 1)
    await removeTabTempFile(targetId)
    await session.syncSession()
  }

  const closeTabsBatch = async (targetIds: string[]) => {
    for (const id of targetIds) {
      if (!tabs.value.some(t => t.id === id)) continue
      await removeTab(id)
      if (tabs.value.some(t => t.id === id)) break
    }
  }

  const closeOtherTabs = async (targetId: string) => {
    activeTab.value = targetId
    await closeTabsBatch(tabs.value.filter(t => t.id !== targetId).map(t => t.id))
  }

  const closeRightTabs = async (targetId: string) => {
    const index = tabs.value.findIndex(t => t.id === targetId)
    if (index === -1 || index >= tabs.value.length - 1) return
    await closeTabsBatch(tabs.value.slice(index + 1).map(t => t.id))
  }

  const closeAllTabs = async () => closeTabsBatch(tabs.value.map(t => t.id))

  const setActiveEncoding = async (encoding: string) => {
    if (!currentTab.value) return
    currentTab.value.encoding = encoding
    currentTab.value.isDirty = true
    await session.cacheTabImmediately(currentTab.value, true)
  }

  const togglePosition = async () => {
    tabPosition.value = tabPosition.value === 'top' ? 'bottom' : 'top'
    await session.syncSession()
  }

  const handleContentChange = (tabId: string, val: string) => {
    const targetTab = tabs.value.find(item => item.id === tabId)
    if (!targetTab) return
    if (val === targetTab.content) return
    const wasClean = !targetTab.isDirty
    targetTab.content = val
    targetTab.isDirty = true
    session.cacheTabImmediately(targetTab, wasClean)
  }

  let unlistenSingleInstance: UnlistenFn | null = null

  onMounted(async () => {
    const cached = await loadSessionFromTemp()
    if (cached) {
      tabs.value = cached.tabs
      activeTab.value = cached.activeTab
      tabPosition.value = cached.tabPosition
      tabs.value.forEach(fileOps.bindFileWatcher)
    } else {
      await addTab()
    }

    try {
      const launchFiles = await invoke<string[]>('take_launch_files')
      if (Array.isArray(launchFiles) && launchFiles.length > 0) {
        await fileOps.enqueueFilesToOpen(launchFiles)
      }
    } catch (e) {
      console.error('获取启动参数文件失败:', e)
    }

    unlistenSingleInstance = await listen<string[]>('single-instance-open', async (event) => {
      if (Array.isArray(event.payload) && event.payload.length > 0) {
        await fileOps.enqueueFilesToOpen(event.payload)
      }
    })
  })

  onUnmounted(() => {
    fileOps.watcher.stopAll()
    if (unlistenSingleInstance) unlistenSingleInstance()
  })

  return {
    tabs, activeTab, tabPosition, currentTab, hasDirtyTabs,
    syncSession: session.syncSession,
    flushAllCaches: session.flushAllCaches,
    openFile: fileOps.openFile,
    handleDroppedPaths: fileOps.handleDroppedPaths,
    saveActiveFile: fileOps.saveActiveFile,
    saveActiveFileAs: fileOps.saveActiveFileAs,
    saveAllFiles: fileOps.saveAllFiles,
    formatActiveJson: fileOps.formatActiveJson,
    minifyActiveJson: fileOps.minifyActiveJson,
    addTab, moveTab, removeTab,
    closeOtherTabs, closeRightTabs, closeAllTabs,
    setActiveEncoding, togglePosition, handleContentChange
  }
}
