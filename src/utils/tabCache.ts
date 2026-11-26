import { join } from '@tauri-apps/api/path'
import {
  exists,
  mkdir,
  readTextFile,
  remove,
  stat,
  writeTextFile
} from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { normalizeEncodingLabel } from './encodingHelper'
import { readFileSmart, readFileWithEncoding, writeFileWithEncoding } from './streamReader'

export { normalizeEncodingLabel, readFileSmart, readFileWithEncoding, writeFileWithEncoding }

export interface TabItem {
  id: string
  title: string
  filePath: string | null
  content: string
  isDirty: boolean
  encoding: string
  pinned?: boolean
  lastModified?: number | null
  fileSize?: number | null
  isLoading?: boolean
  loadProgress?: number
}

export interface WindowState {
  width: number
  height: number
  maximized?: boolean
}

export interface SessionData {
  activeTab: string
  tabPosition: 'top' | 'bottom'
  windowState?: WindowState
  tabs: Omit<TabItem, 'content' | 'isLoading' | 'loadProgress'>[]
}

export async function getConfigDir() {
  const exeDir = await invoke<string>('get_exe_dir')
  const configDir = await join(exeDir, 'config')
  if (!(await exists(configDir))) {
    await mkdir(configDir, { recursive: true })
  }
  return configDir
}

export async function getFileFingerprint(
  filePath: string
): Promise<{ mtime: number | null; size: number } | null> {
  try {
    const info = await stat(filePath)
    const mtime = info.mtime ? new Date(info.mtime).getTime() : null
    return { mtime, size: info.size }
  } catch {
    return null
  }
}

const inFlightWrites = new Map<string, Promise<void>>()
const pendingContents = new Map<string, string>()
const canceledTabs = new Set<string>()

export function writeTabTempImmediate(tabId: string, content: string): Promise<void> {
  canceledTabs.delete(tabId)
  pendingContents.set(tabId, content)

  if (inFlightWrites.has(tabId)) {
    return inFlightWrites.get(tabId)!
  }

  const runQueue = (async () => {
    try {
      const configDir = await getConfigDir()
      const file = await join(configDir, `${tabId}.tmp`)
      while (pendingContents.has(tabId)) {
        const latestContent = pendingContents.get(tabId)!
        pendingContents.delete(tabId)
        if (canceledTabs.has(tabId)) break
        await writeTextFile(file, latestContent)
      }
    } catch (e) {
      console.error(`立即写入临时缓存失败 (${tabId}):`, e)
    } finally {
      inFlightWrites.delete(tabId)
    }
  })()

  inFlightWrites.set(tabId, runQueue)
  return runQueue
}

export async function flushAllPendingWrites(): Promise<void> {
  while (inFlightWrites.size > 0) {
    await Promise.allSettled(Array.from(inFlightWrites.values()))
  }
}

export async function removeTabTempFile(tabId: string) {
  canceledTabs.add(tabId)
  pendingContents.delete(tabId)
  if (inFlightWrites.has(tabId)) {
    await inFlightWrites.get(tabId)
  }
  const configDir = await getConfigDir()
  const file = await join(configDir, `${tabId}.tmp`)
  if (await exists(file)) {
    await remove(file)
  }
}

export async function writeSessionFile(data: SessionData) {
  const configDir = await getConfigDir()
  const file = await join(configDir, 'config.json')
  await writeTextFile(file, JSON.stringify(data, null, 2))
}

export async function loadSessionFromTemp(): Promise<{
  tabs: TabItem[]
  activeTab: string
  tabPosition: 'top' | 'bottom'
  windowState?: WindowState
} | null> {
  try {
    const configDir = await getConfigDir()
    const configFile = await join(configDir, 'config.json')
    if (!(await exists(configFile))) return null

    const raw = await readTextFile(configFile)
    const session: SessionData = JSON.parse(raw)
    if (!Array.isArray(session.tabs) || session.tabs.length === 0) return null

    const tabs: TabItem[] = []
    for (const meta of session.tabs) {
      let content = ''
      let isDirty = false
      let lastModified = meta.lastModified ?? null
      let fileSize = meta.fileSize ?? null
      const savedEncoding = normalizeEncodingLabel(meta.encoding)
      const tmpFile = await join(configDir, `${meta.id}.tmp`)
      const hasTmp = await exists(tmpFile)

      if (meta.filePath && (await exists(meta.filePath))) {
        const currentFp = await getFileFingerprint(meta.filePath)
        const isFileModifiedExternally =
          currentFp !== null &&
          meta.lastModified !== undefined &&
          meta.lastModified !== null &&
          (currentFp.mtime !== meta.lastModified || currentFp.size !== meta.fileSize)

        if (isFileModifiedExternally) {
          content = await readFileSmart(meta.filePath, undefined, savedEncoding)
          isDirty = false
          lastModified = currentFp?.mtime ?? null
          fileSize = currentFp?.size ?? null
          if (hasTmp) await removeTabTempFile(meta.id)
        } else if (hasTmp && meta.isDirty) {
          content = await readTextFile(tmpFile)
          isDirty = true
        } else {
          content = await readFileSmart(meta.filePath, undefined, savedEncoding)
          isDirty = false
          lastModified = currentFp?.mtime ?? lastModified
          fileSize = currentFp?.size ?? fileSize
          if (hasTmp) await removeTabTempFile(meta.id)
        }
      } else if (hasTmp) {
        content = await readTextFile(tmpFile)
        isDirty = true
      }

      tabs.push({
        ...meta,
        isDirty,
        lastModified,
        fileSize,
        encoding: savedEncoding,
        content,
        isLoading: false,
        loadProgress: 100
      })
    }

    const firstRestored = tabs.slice(0, 1).pop()
    return {
      tabs,
      activeTab: session.activeTab || (firstRestored ? firstRestored.id : ''),
      tabPosition: session.tabPosition || 'top',
      windowState: session.windowState
    }
  } catch (e) {
    console.error('读取临时缓存失败:', e)
    return null
  }
}
