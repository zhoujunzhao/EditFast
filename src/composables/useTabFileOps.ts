import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { basename } from '@tauri-apps/api/path'
import { ask, message, open } from '@tauri-apps/plugin-dialog'
import {
  getFileFingerprint,
  readFileSmart,
  readFileWithEncoding,
  removeTabTempFile,
  type TabItem
} from '@/utils/tabCache'
import { FileWatcherManager } from '@/utils/fileWatcher'
import { collectDroppedFiles } from '@/utils/fileBatchHelper'
import { useTabFileSaver } from './useTabFileSaver'

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
        latest = await readFileSmart(target.filePath, undefined, target.encoding)
      } catch {
        return
      }

      const fp = await getFileFingerprint(target.filePath)

      if (latest === target.content) {
        target.isDirty = false
        target.lastModified = fp?.mtime ?? null
        target.fileSize = fp?.size ?? null
        await removeTabTempFile(target.id)
        await deps.syncSession()
        return
      }

      if (!target.isDirty) {
        target.content = latest
        target.lastModified = fp?.mtime ?? null
        target.fileSize = fp?.size ?? null
        await removeTabTempFile(target.id)
        await deps.syncSession()
        return
      }

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

    const reactiveTab = tabs.value.find(item => item.id === newTabId)
    if (!reactiveTab) return

    try {
      if (cachedMatch) {
        reactiveTab.content = cachedMatch.content
        reactiveTab.isDirty = true
        reactiveTab.isLoading = false
        reactiveTab.loadProgress = 100
      } else {
        const res = await readFileWithEncoding(selected, (percent) => {
          reactiveTab.loadProgress = percent
        })
        reactiveTab.content = res.content
        reactiveTab.encoding = res.encoding
        reactiveTab.isDirty = false
        reactiveTab.loadProgress = 100
        reactiveTab.isLoading = false
        await removeTabTempFile(newTabId)
      }
    } catch (e: any) {
      console.error('读取文件失败:', selected, e)
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

  const saverOps = useTabFileSaver(tabs, currentTab, watcher, bindFileWatcher, deps)

  return {
    watcher,
    bindFileWatcher,
    enqueueFilesToOpen,
    openFile,
    handleDroppedPaths,
    ...saverOps
  }
}
