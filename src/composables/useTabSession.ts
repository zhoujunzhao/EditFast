import {ref, Ref} from 'vue'
import { exists, readTextFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import {
  flushAllPendingWrites,
  getConfigDir,
  removeTabTempFile,
  readFileSmart,
  type SessionData,
  type TabItem,
  writeSessionFile,
  writeTabTempImmediate
} from '@/utils/tabCache'

import type { WindowState } from '@/utils/tabCache'


export function useTabSession(
  tabs: Ref<TabItem[]>,
  activeTab: Ref<string>,
  tabPosition: Ref<'top' | 'bottom'>
) {

  const windowState = ref<WindowState | undefined>(undefined)

  const setWindowState = async (state: WindowState) => {
    windowState.value = state
    await syncSession()
  }

  const syncSession = async () => {
    try {
      await writeSessionFile({
        activeTab: activeTab.value,
        tabPosition: tabPosition.value,
        tabs: tabs.value.map(({ content, isLoading, loadProgress, ...meta }) => meta),
        windowState: windowState.value
      })
    } catch (e) {
      console.error('同步配置文件失败:', e)
    }
  }

  // 仅当文件存在未保存修改或为新建草稿时才写入 .tmp 缓存
  const cacheTabImmediately = async (tab: TabItem, needSyncMeta = false) => {
    if (!tab.isDirty && tab.filePath) {
      await removeTabTempFile(tab.id)
    } else {
      await writeTabTempImmediate(tab.id, tab.content)
    }
    if (needSyncMeta) {
      await syncSession()
    }
  }

  const flushAllCaches = async () => {
    await flushAllPendingWrites()
    for (const tab of tabs.value) {
      if (!tab.isDirty && tab.filePath) {
        await removeTabTempFile(tab.id)
      }
    }
    await syncSession()
  }

  // 校验指定本地路径在 config.json 中是否存在有效的未保存缓存
  const resolveCachedContentIfValid = async (
    filePath: string,
    currentFp: { mtime: number | null; size: number } | null
  ): Promise<{ content: string; isDirty: boolean; reusedTabId?: string } | null> => {
    try {
      const configDir = await getConfigDir()
      const configFile = await join(configDir, 'config.json')
      if (!(await exists(configFile))) return null

      const raw = await readTextFile(configFile)
      const session: SessionData = JSON.parse(raw)
      if (!Array.isArray(session.tabs)) return null

      const matchedMeta = session.tabs.find(t => t.filePath === filePath)
      if (!matchedMeta) return null

      const tmpFile = await join(configDir, `${matchedMeta.id}.tmp`)
      if (!(await exists(tmpFile))) return null

      const isModifiedOnDisk =
        currentFp !== null &&
        matchedMeta.lastModified !== undefined &&
        matchedMeta.lastModified !== null &&
        (currentFp.mtime !== matchedMeta.lastModified || currentFp.size !== matchedMeta.fileSize)

      if (isModifiedOnDisk) {
        await removeTabTempFile(matchedMeta.id)
        return null
      }

      const cachedContent = await readFileSmart(tmpFile)
      return { content: cachedContent, isDirty: true, reusedTabId: matchedMeta.id }
    } catch {
      return null
    }
  }

  return {
    syncSession,
    cacheTabImmediately,
    flushAllCaches,
    resolveCachedContentIfValid,
    windowState,
    setWindowState
  }
}
