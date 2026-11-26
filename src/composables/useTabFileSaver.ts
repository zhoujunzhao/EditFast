import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { basename } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'
import { message, save } from '@tauri-apps/plugin-dialog'
import {
  getFileFingerprint,
  normalizeEncodingLabel,
  readFileWithEncoding,
  removeTabTempFile,
  writeFileWithEncoding,
  type TabItem
} from '@/utils/tabCache'
import type { FileWatcherManager } from '@/utils/fileWatcher'

export function useTabFileSaver(
  tabs: Ref<TabItem[]>,
  currentTab: Ref<TabItem | null>,
  watcher: FileWatcherManager,
  bindFileWatcher: (tab: TabItem) => void,
  deps: {
    syncSession: () => Promise<void>
    cacheTabImmediately: (tab: TabItem, needSyncMeta?: boolean) => Promise<void>
  }
) {
  const { t } = useI18n()

  const toAsciiText = (text: string): string => {
    const clean = text.startsWith('\uFEFF') ? text.slice(1) : text
    return Array.from(clean)
      .map(ch => ((ch.codePointAt(0) ?? 0) <= 0x7f ? ch : '?'))
      .join('')
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
    await writeFileWithEncoding(targetPath, tab.content, tab.encoding)

    if (normalizeEncodingLabel(tab.encoding) === 'ASCII') {
      tab.content = toAsciiText(tab.content)
    }

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

  const saveActiveFile = async () => {
    if (currentTab.value) await saveTab(currentTab.value)
  }

  const saveActiveFileAs = async () => {
    if (!currentTab.value) return
    const chosen = await save({ defaultPath: currentTab.value.filePath || currentTab.value.title })
    if (!chosen) return

    watcher.markSelfSaving(chosen)
    await writeFileWithEncoding(chosen, currentTab.value.content, currentTab.value.encoding)

    if (normalizeEncodingLabel(currentTab.value.encoding) === 'ASCII') {
      currentTab.value.content = toAsciiText(currentTab.value.content)
    }

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

  const changeTabEncoding = async (targetEncoding: string) => {
    const tab = currentTab.value
    if (!tab) return
    const normalized = normalizeEncodingLabel(targetEncoding)
    if (tab.encoding === normalized) return

    if (
      tab.filePath &&
      !tab.isDirty &&
      tab.content.includes('\uFFFD') &&
      (await exists(tab.filePath))
    ) {
      try {
        tab.isLoading = true
        tab.loadProgress = 0
        const res = await readFileWithEncoding(
          tab.filePath,
          (percent) => {
            tab.loadProgress = percent
          },
          normalized
        )
        tab.content = res.content
        tab.encoding = normalized
        tab.isDirty = false
        tab.loadProgress = 100
        tab.isLoading = false
        await removeTabTempFile(tab.id)
        await deps.syncSession()
        return
      } catch (e: any) {
        tab.isLoading = false
        await message(`按 ${normalized} 重新解码失败:\n${e?.message || String(e)}`, {
          kind: 'error'
        })
        return
      }
    }

    tab.encoding = normalized
    tab.isDirty = true
    await deps.cacheTabImmediately(tab, true)
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
    saveTab,
    saveActiveFile,
    saveActiveFileAs,
    saveAllFiles,
    changeTabEncoding,
    formatActiveJson: () => transformJson(true),
    minifyActiveJson: () => transformJson(false)
  }
}
