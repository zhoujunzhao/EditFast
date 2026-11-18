import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { writeTextFile, stat, readDir } from '@tauri-apps/plugin-fs'
import { basename, join} from '@tauri-apps/api/path'
import {ask, message, open, save} from '@tauri-apps/plugin-dialog'

import {computed, onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  flushAllPendingWrites,
  loadSessionFromTemp,
  readFileSmart,
  removeTabTempFile,
  type TabItem,
  writeSessionFile,
  writeTabTempImmediate
} from '@/utils/tabCache'

import {FileWatcherManager} from '@/utils/fileWatcher'

let unlistenSingleInstance: UnlistenFn | null = null

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'js', 'jsx', 'ts', 'tsx',
  'vue', 'html', 'htm', 'css', 'scss', 'less', 'rs', 'toml', 'yaml', 'yml',
  'xml', 'svg', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'php',
  'rb', 'sh', 'bat', 'ps1', 'sql', 'log', 'csv', 'ini', 'conf', 'env'
])

const IGNORE_DIRS = new Set(['node_modules', '.git', 'target', 'dist', '.idea', '.vscode'])

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

      const confirmed = await ask(t('dialog.reloadMessage', {title: target.title}), {
        title: t('dialog.reloadTitle'),
        kind: 'warning'
      })
      if (confirmed && target.filePath) {
        target.content = await readFileSmart(target.filePath)
        target.isDirty = false
        await removeTabTempFile(target.id)
        await syncSession()
      }
    }).then()
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

  // 移动标签页顺序并持久化到 session.json
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
    const [movedItem] = tabs.value.splice(fromIndex, 1)
    tabs.value.splice(toIndex, 0, movedItem)
    await syncSession()
  }

  const openQueue: string[] = []
  let isOpeningQueue = false

  const enqueueFilesToOpen = async (paths: string[]) => {
    for (const p of paths) {
      if (p && !openQueue.includes(p)) {
        openQueue.push(p)
      }
    }
    if (isOpeningQueue) return

    isOpeningQueue = true
    try {
      while (openQueue.length > 0) {
        const nextPath = openQueue.shift()!
        await openFileByPath(nextPath)
      }
    } finally {
      isOpeningQueue = false
    }
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

    try {
      const launchFiles = await invoke<string[]>('take_launch_files')
      if (Array.isArray(launchFiles) && launchFiles.length > 0) {
        await enqueueFilesToOpen(launchFiles)
      }
    } catch (e) {
      console.error('获取启动参数文件失败:', e)
    }

    // 监听二次启动传入的文件路径数组
    unlistenSingleInstance = await listen<string[]>('single-instance-open', async (event) => {
      if (Array.isArray(event.payload) && event.payload.length > 0) {
        await enqueueFilesToOpen(event.payload)
      }
    })
  })

  onUnmounted(() => {
    watcher.stopAll()
    if (unlistenSingleInstance) {
      unlistenSingleInstance()
    }
  })

  const openFileByPath = async (selected: string) => {
    const existing = tabs.value.find(item => item.filePath === selected)
    if (existing) {
      activeTab.value = existing.id
      await syncSession()
      return
    }

    const fileName = await basename(selected)
    let tabId: string

    if (tabs.value.length === 1 && !tabs.value[0].filePath && !tabs.value[0].isDirty && tabs.value[0].content === '') {
      tabId = tabs.value[0].id
      await removeTabTempFile(tabId)
      Object.assign(tabs.value, {
        title: fileName, filePath: selected, content: '', isDirty: false,
        encoding: 'UTF-8', isLoading: true, loadProgress: 0
      })
    } else {
      tabId = `tab-${Date.now()}`
      tabs.value.push({
        id: tabId, title: fileName, filePath: selected, content: '',
        isDirty: false, encoding: 'UTF-8', isLoading: true, loadProgress: 0
      })
      activeTab.value = tabId
    }

    const reactiveTab = tabs.value.find(item => item.id === tabId)
    if (!reactiveTab) return

    try {
      reactiveTab.content = await readFileSmart(selected, (percent) => {
        reactiveTab.loadProgress = percent
      })
    } catch (e) {
      console.error('读取文件失败:', e)
    } finally {
      reactiveTab.isLoading = false
      reactiveTab.loadProgress = 100
      await syncSession()
      bindFileWatcher(reactiveTab)
    }
  }

  const openFile = async () => {
    const selected = await open({
      multiple: true,
      filters: [
        { name: t('dialog.filterText'), extensions: ['txt', 'md', 'json', 'js', 'ts', 'vue', 'html', 'css', 'rs', 'py', 'log', 'csv'] },
        { name: t('dialog.filterAll'), extensions: ['*'] }
      ]
    })
    if (Array.isArray(selected) && selected.length > 0) {
      await enqueueFilesToOpen(selected)
    } else if (typeof selected === 'string') {
      await enqueueFilesToOpen([selected])
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
    cacheTabImmediately(currentTab.value, wasClean).then();
  }

  // 递归收集文件夹下的所有文本文件
  const collectFilesFromDir = async (dirPath: string, result: string[]) => {
    try {
      const entries = await readDir(dirPath)
      for (const entry of entries) {
        if (!entry.name) continue
        const fullPath = await join(dirPath, entry.name)
        if (entry.isDirectory) {
          if (!IGNORE_DIRS.has(entry.name)) {
            await collectFilesFromDir(fullPath, result)
          }
        } else if (entry.isFile) {
          const ext = entry.name.split('.').pop()?.toLowerCase() || ''
          if (TEXT_EXTENSIONS.has(ext) || !entry.name.includes('.')) {
            result.push(fullPath)
          }
        }
      }
    } catch (e) {
      console.error(`遍历文件夹失败 (${dirPath}):`, e)
    }
  }

  // 处理从系统资源管理器拖入的文件文件夹路径列表
  const handleDroppedPaths = async (paths: string[]) => {
    const filesToOpen: string[] = []

    for (const p of paths) {
      try {
        const info = await stat(p)
        if (info.isDirectory) {
          await collectFilesFromDir(p, filesToOpen)
        } else if (info.isFile) {
          filesToOpen.push(p)
        }
      } catch (e) {
        console.error(`读取拖入路径信息失败 (${p}):`, e)
      }
    }

    if (filesToOpen.length > 0) {
      await enqueueFilesToOpen(filesToOpen)
    }
  }

  // 批量关闭指定 ID 列表的标签（若中途用户取消保存确认框，则停止后续关闭）
  const closeTabsBatch = async (targetIds: string[]) => {
    for (const id of targetIds) {
      const stillExists = tabs.value.some(t => t.id === id)
      if (!stillExists) continue
      await removeTab(id)
      // 如果调用 removeTab 后该标签依然存在，说明用户在未保存弹窗里点了“取消”
      if (tabs.value.some(t => t.id === id)) {
        break
      }
    }
  }

  // 关闭除 targetId 以外的所有标签
  const closeOtherTabs = async (targetId: string) => {
    activeTab.value = targetId
    const idsToClose = tabs.value.filter(t => t.id !== targetId).map(t => t.id)
    await closeTabsBatch(idsToClose)
  }

  // 关闭 targetId 右侧的所有标签
  const closeRightTabs = async (targetId: string) => {
    const index = tabs.value.findIndex(t => t.id === targetId)
    if (index === -1 || index >= tabs.value.length - 1) return
    const idsToClose = tabs.value.slice(index + 1).map(t => t.id)
    await closeTabsBatch(idsToClose)
  }

  // 关闭全部标签
  const closeAllTabs = async () => {
    const idsToClose = tabs.value.map(t => t.id)
    await closeTabsBatch(idsToClose)
  }



  return {
    tabs, activeTab, tabPosition, currentTab, hasDirtyTabs,
    syncSession, addTab, openFile, saveActiveFile, saveActiveFileAs,
    saveAllFiles, setActiveEncoding, removeTab, togglePosition,
    handleContentChange, flushAllCaches, handleDroppedPaths, moveTab,
    closeOtherTabs, closeRightTabs, closeAllTabs
  }
}
