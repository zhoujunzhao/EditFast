import type {Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {basename} from '@tauri-apps/api/path'
import {writeTextFile} from '@tauri-apps/plugin-fs'
import {ask, message, open, save} from '@tauri-apps/plugin-dialog'
import {getFileFingerprint, readFileSmart, removeTabTempFile, type TabItem} from '@/utils/tabCache'
import {FileWatcherManager} from '@/utils/fileWatcher'
import {collectDroppedFiles} from '@/utils/fileBatchHelper'

export function useTabFileOps(
  tabs: Ref<TabItem[]>,
  activeTab: Ref<string>,
  currentTab: Ref<TabItem | null>,
  deps: {
    syncSession: () => Promise<void>
    cacheTabImmediately: (tab: TabItem, needSyncMeta?: boolean) => Promise<void>
    resolveCachedContentIfValid: (
      filePath: string,
      currentFp: { mtime: number | null; size: number } | null
    ) => Promise<{ content: string; isDirty: boolean; reusedTabId?: string } | null>
  }
) {
  const { t } = useI18n()
  const watcher = new FileWatcherManager()

  const bindFileWatcher = (tab: TabItem) => {
    if (!tab.filePath) return
    watcher.start(tab.id, tab.filePath, async () => {
      const target = tabs.value.find(item => item.id === tab.id)
      if (!target || !target.filePath) return

      let latest = ''
      try {
        latest = await readFileSmart(target.filePath)
      } catch {
        return
      }

      const fp = await getFileFingerprint(target.filePath)

      // 核心判断：无论当前标签是否有未保存标记，只要磁盘内容与当前编辑器内容完全一致，就直接更新指纹并清理缓存，绝不误弹窗
      if (latest === target.content) {
        target.isDirty = false
        target.lastModified = fp?.mtime ?? null
        target.fileSize = fp?.size ?? null
        await removeTabTempFile(target.id)
        await deps.syncSession()
        return
      }

      // 内容确实不同，且当前标签没有未保存修改：静默重载最新内容
      if (!target.isDirty) {
        target.content = latest
        target.lastModified = fp?.mtime ?? null
        target.fileSize = fp?.size ?? null
        await removeTabTempFile(target.id)
        await deps.syncSession()
        return
      }

      // 内容确实不同，且当前标签有未保存修改：弹窗询问用户
      const confirmed = await ask(t('dialog.reloadMessage', { title: target.title }), {
        title: t('dialog.reloadTitle'),
        kind: 'warning'
      })
      if (confirmed && target.filePath) {
        target.content = latest
        target.isDirty = false
        target.lastModified = fp?.mtime ?? null
        target.fileSize = fp?.size ?? null
        await removeTabTempFile(target.id)
        await deps.syncSession()
      }
    })
  }


  const openFileByPath = async (selected: string) => {
    const existing = tabs.value.find(item => item.filePath === selected)
    if (existing) {
      activeTab.value = existing.id
      await deps.syncSession()
      return
    }

    const fileName = await basename(selected)
    const currentFp = await getFileFingerprint(selected)
    const cachedMatch = await deps.resolveCachedContentIfValid(selected, currentFp)
    const newTabId = cachedMatch?.reusedTabId || `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    // 1. 先创建处于 loading 状态的标签页并立即展示进度条
    const placeholderTab: TabItem = {
      id: newTabId,
      title: fileName,
      filePath: selected,
      content: '',
      isDirty: false,
      encoding: 'UTF-8',
      lastModified: currentFp?.mtime ?? null,
      fileSize: currentFp?.size ?? null,
      isLoading: !cachedMatch,
      loadProgress: cachedMatch ? 100 : 0
    }

    const firstTab = tabs.value.slice(0, 1).pop()
    const replacedEmptyTab = Boolean(
      tabs.value.length === 1 &&
      firstTab &&
      !firstTab.filePath &&
      !firstTab.isDirty &&
      firstTab.content === ''
    )

    if (replacedEmptyTab && firstTab) {
      await removeTabTempFile(firstTab.id)
      tabs.value.splice(0, 1, placeholderTab)
    } else {
      tabs.value.push(placeholderTab)
    }

    activeTab.value = newTabId

    // 必须通过 tabs.value.find 获取 Vue 响应式代理对象，更新进度才会触发视图刷新
    const reactiveTab = tabs.value.find(item => item.id === newTabId)
    if (!reactiveTab) return

    try {
      if (cachedMatch) {
        reactiveTab.content = cachedMatch.content
        reactiveTab.isDirty = true
        reactiveTab.isLoading = false
        reactiveTab.loadProgress = 100
      } else {
        reactiveTab.content = await readFileSmart(selected, (percent) => {
          reactiveTab.loadProgress = percent
        })
        reactiveTab.isDirty = false
        reactiveTab.loadProgress = 100
        reactiveTab.isLoading = false
        await removeTabTempFile(newTabId)
      }
    } catch (e: any) {
      console.error('读取文件失败:', selected, e)
      // 读取失败时移除占位标签，若原本替换了空标签则恢复一个新空标签
      const idx = tabs.value.findIndex(item => item.id === newTabId)
      if (idx !== -1) tabs.value.splice(idx, 1)
      await message(`读取文件失败 (${selected}):\n${e?.message || String(e)}`, { kind: 'error' })
      return
    }

    await deps.syncSession()
    bindFileWatcher(reactiveTab)
  }


  const openQueue = Array<string>()
  let isOpeningQueue = false

  const enqueueFilesToOpen = async (paths: string[]) => {
    for (const p of paths) {
      if (p && !openQueue.includes(p)) openQueue.push(p)
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
      await enqueueFilesToOpen(Array.of(selected))
    }
  }

  const handleDroppedPaths = async (paths: string[]) => {
    const filesToOpen = await collectDroppedFiles(paths)
    if (filesToOpen.length > 0) await enqueueFilesToOpen(filesToOpen)
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

    const fp = await getFileFingerprint(targetPath)
    tab.filePath = targetPath
    tab.title = await basename(targetPath)
    tab.isDirty = false
    tab.lastModified = fp?.mtime ?? null
    tab.fileSize = fp?.size ?? null

    await removeTabTempFile(tab.id)
    await deps.syncSession()
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

    const fp = await getFileFingerprint(chosen)
    currentTab.value.filePath = chosen
    currentTab.value.title = await basename(chosen)
    currentTab.value.isDirty = false
    currentTab.value.lastModified = fp?.mtime ?? null
    currentTab.value.fileSize = fp?.size ?? null

    await removeTabTempFile(currentTab.value.id)
    await deps.syncSession()
    bindFileWatcher(currentTab.value)
  }

  const saveAllFiles = async () => {
    for (const tab of tabs.value) {
      if (tab.isDirty && !(await saveTab(tab))) break
    }
  }

  const transformJson = async (pretty: boolean) => {
    if (!currentTab.value) return
    const raw = currentTab.value.content.trim()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      const result = pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed)
      if (result !== currentTab.value.content) {
        currentTab.value.content = result
        currentTab.value.isDirty = true
        await deps.cacheTabImmediately(currentTab.value, true)
      }
    } catch (e: any) {
      await message(t('topMenu.tools.invalidJson', { error: e?.message || String(e) }), {
        title: t(pretty ? 'topMenu.tools.formatJson' : 'topMenu.tools.minifyJson'),
        kind: 'error'
      })
    }
  }

  return {
    watcher,
    bindFileWatcher,
    enqueueFilesToOpen,
    openFile,
    handleDroppedPaths,
    saveTab,
    saveActiveFile,
    saveActiveFileAs,
    saveAllFiles,
    formatActiveJson: () => transformJson(true),
    minifyActiveJson: () => transformJson(false)
  }
}
