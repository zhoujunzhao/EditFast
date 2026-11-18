import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { basename } from '@tauri-apps/api/path'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { open, save, message, ask } from '@tauri-apps/plugin-dialog'
import {
  type TabItem,
  readFileSmart,
  writeTabTempImmediate,
  flushAllPendingWrites,
  removeTabTempFile,
  writeSessionFile,
  loadSessionFromTemp
} from '@/utils/tabCache'
import { FileWatcherManager } from '@/utils/fileWatcher'

export function useEditorTabs() {
  const { t } = useI18n()
  const tabs = ref<TabItem[]>([])
  const activeTab = ref<string>('')
  const tabPosition = ref<'top' | 'bottom'>('top')

  const currentTab = computed(() => tabs.value.find(item => item.id === activeTab.value) || null)
  const hasDirtyTabs = computed(() => tabs.value.some(item => item.isDirty))
  const watcher = new FileWatcherManager()

  const syncSession = async () => {
    try {
      await writeSessionFile({
        activeTab: activeTab.value,
        tabPosition: tabPosition.value,
        tabs: tabs.value.map(({ content, isLoading, loadProgress, ...meta }) => meta)
      })
    } catch (e) {
      console.error(e)
    }
  }

  // 立即缓存当前标签内容到 temp/{id}.tmp
  const cacheTabImmediately = async (tab: TabItem, needSyncMeta = false) => {
    await writeTabTempImmediate(tab.id, tab.content)
    if (needSyncMeta) {
      await syncSession()
    }
  }

  const flushAllCaches = async () => {
    await flushAllPendingWrites()
    await syncSession()
  }

  const bindFileWatcher = (tab: TabItem) => {
    if (!tab.filePath) return
    watcher.start(tab.id, tab.filePath, async () => {
      const target = tabs.value.find(item => item.id === tab.id)
      if (!target || !target.filePath) return

      if (!target.isDirty) {
        const latest = await readFileSmart(target.filePath)
        if (latest !== target.content) {
          target.content = latest
          await syncSession()
        }
        return
      }

      const confirmed = await ask(t('dialog.reloadMessage', { title: target.title }), {
        title: t('dialog.reloadTitle'),
        kind: 'warning'
      })
      if (confirmed && target.filePath) {
        target.content = await readFileSmart(target.filePath)
        target.isDirty = false
        await removeTabTempFile(target.id)
        await syncSession()
      }
    })
  }

  let counter = 1
  const addTab = async () => {
    const newId = `tab-${Date.now()}`
    const newTab: TabItem = {
      id: newId,
      title: t('tabs.untitled', { num: counter++ }),
      content: '',
      filePath: null,
      isDirty: false,
      encoding: 'UTF-8'
    }
    tabs.value.push(newTab)
    activeTab.value = newId
    await cacheTabImmediately(newTab, true)
  }

  onMounted(async () => {
    const cached = await loadSessionFromTemp()
    if (cached) {
      tabs.value = cached.tabs
      activeTab.value = cached.activeTab
      tabPosition.value = cached.tabPosition
      tabs.value.forEach(bindFileWatcher)
    } else {
      await addTab()
    }
  })

  onUnmounted(() => watcher.stopAll())

  const openFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: t('dialog.filterText'), extensions: ['txt', 'md', 'json', 'js', 'ts', 'vue', 'html', 'css', 'rs', 'py', 'log', 'csv'] },
        { name: t('dialog.filterAll'), extensions: ['*'] }
      ]
    })
    if (!selected || typeof selected !== 'string') return

    const existing = tabs.value.find(item => item.filePath === selected)
    if (existing) {
      activeTab.value = existing.id
      await syncSession()
      return
    }

    const fileName = await basename(selected)
    let targetTab: TabItem

    if (tabs.value.length === 1 && !tabs.value[0].filePath && !tabs.value[0].isDirty && tabs.value[0].content === '') {
      const oldId = tabs.value[0].id
      await removeTabTempFile(oldId)
      targetTab = tabs.value[0]
      Object.assign(targetTab, {
        title: fileName, filePath: selected, content: '', isDirty: false,
        encoding: 'UTF-8', isLoading: true, loadProgress: 0
      })
    } else {
      targetTab = {
        id: `tab-${Date.now()}`, title: fileName, filePath: selected, content: '',
        isDirty: false, encoding: 'UTF-8', isLoading: true, loadProgress: 0
      }
      tabs.value.push(targetTab)
      activeTab.value = targetTab.id
    }

    try {
      targetTab.content = await readFileSmart(selected, (percent) => {
        targetTab.loadProgress = percent
      })
    } finally {
      targetTab.isLoading = false
      targetTab.loadProgress = 100
      await syncSession()
      bindFileWatcher(targetTab)
    }
  }

  const saveTab = async (tab: TabItem): Promise<boolean> => {
    let targetPath = tab.filePath
    const isNewPath = !targetPath

    if (!targetPath) {
      const chosen = await save({ defaultPath: tab.title })
      if (!chosen) return false
      targetPath = chosen
    }

    watcher.markSelfSaving(targetPath)
    await writeTextFile(targetPath, tab.content)
    tab.filePath = targetPath
    tab.title = await basename(targetPath)
    tab.isDirty = false
    await removeTabTempFile(tab.id)
    await syncSession()

    if (isNewPath) bindFileWatcher(tab)
    return true
  }

  const saveActiveFile = async () => { if (currentTab.value) await saveTab(currentTab.value) }

  const saveActiveFileAs = async () => {
    if (!currentTab.value) return
    const chosen = await save({ defaultPath: currentTab.value.filePath || currentTab.value.title })
    if (!chosen) return

    watcher.markSelfSaving(chosen)
    await writeTextFile(chosen, currentTab.value.content)
    currentTab.value.filePath = chosen
    currentTab.value.title = await basename(chosen)
    currentTab.value.isDirty = false
    await removeTabTempFile(currentTab.value.id)
    await syncSession()
    bindFileWatcher(currentTab.value)
  }

  const saveAllFiles = async () => {
    for (const tab of tabs.value) {
      if (tab.isDirty && !(await saveTab(tab))) break
    }
  }

  const setActiveEncoding = async (encoding: string) => {
    if (!currentTab.value) return
    currentTab.value.encoding = encoding
    currentTab.value.isDirty = true
    await cacheTabImmediately(currentTab.value, true)
  }

  const removeTab = async (targetId: string, event?: MouseEvent) => {
    if (event) event.stopPropagation()
    const index = tabs.value.findIndex(item => item.id === targetId)
    if (index === -1) return

    const targetTab = tabs.value[index]
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
        if (!(await saveTab(targetTab))) return
      }
    }

    watcher.stop(targetId)

    if (activeTab.value === targetId) {
      const nextTab = tabs.value[index + 1] || tabs.value[index - 1]
      activeTab.value = nextTab ? nextTab.id : ''
    }
    tabs.value.splice(index, 1)
    await removeTabTempFile(targetId)
    await syncSession()
  }

  const togglePosition = async () => {
    tabPosition.value = tabPosition.value === 'top' ? 'bottom' : 'top'
    await syncSession()
  }

  // 内容一旦有修改，立即写入 temp 目录缓存
  const handleContentChange = (val: string) => {
    if (!currentTab.value) return
    const wasClean = !currentTab.value.isDirty
    currentTab.value.content = val
    currentTab.value.isDirty = true
    cacheTabImmediately(currentTab.value, wasClean)
  }

  return {
    tabs, activeTab, tabPosition, currentTab, hasDirtyTabs,
    syncSession, addTab, openFile, saveActiveFile, saveActiveFileAs,
    saveAllFiles, setActiveEncoding, removeTab, togglePosition,
    handleContentChange, flushAllCaches
  }
}
