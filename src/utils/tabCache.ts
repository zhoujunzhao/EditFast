import { executableDir, join } from '@tauri-apps/api/path'
import {
  exists,
  mkdir,
  open as fsOpen,
  stat,
  readTextFile,
  writeTextFile,
  remove
} from '@tauri-apps/plugin-fs'

export interface TabItem {
  id: string
  title: string
  filePath: string | null
  content: string
  isDirty: boolean
  encoding: string
  isLoading?: boolean
  loadProgress?: number
}

export interface SessionData {
  activeTab: string
  tabPosition: 'top' | 'bottom'
  tabs: Omit<TabItem, 'content' | 'isLoading' | 'loadProgress'>[]
}

const STREAM_THRESHOLD = 100 * 1024 * 1024
const CHUNK_SIZE = 4 * 1024 * 1024

export async function getTempDir() {
  const exeDir = await executableDir()
  const tempDir = await join(exeDir, 'temp')
  if (!(await exists(tempDir))) {
    await mkdir(tempDir, { recursive: true })
  }
  return tempDir
}

// 串行写入队列：保证每次修改零延迟立即落盘，且连续快速打字时严格按顺序写入最新版本
const inFlightWrites = new Map<string, Promise<void>>()
const pendingContents = new Map<string, string>()

export function writeTabTempImmediate(tabId: string, content: string): Promise<void> {
  pendingContents.set(tabId, content)

  if (inFlightWrites.has(tabId)) {
    return inFlightWrites.get(tabId)!
  }

  const runQueue = (async () => {
    try {
      const tempDir = await getTempDir()
      const file = await join(tempDir, `${tabId}.tmp`)
      while (pendingContents.has(tabId)) {
        const latestContent = pendingContents.get(tabId)!
        pendingContents.delete(tabId)
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

// 等待所有正在进行的写入全部完成（关窗前调用）
export async function flushAllPendingWrites(): Promise<void> {
  while (inFlightWrites.size > 0) {
    await Promise.allSettled(Array.from(inFlightWrites.values()))
  }
}

export async function removeTabTempFile(tabId: string) {
  pendingContents.delete(tabId)
  if (inFlightWrites.has(tabId)) {
    await inFlightWrites.get(tabId)
  }
  const tempDir = await getTempDir()
  const file = await join(tempDir, `${tabId}.tmp`)
  if (await exists(file)) {
    await remove(file)
  }
}

export async function readFileSmart(
  filePath: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const fileStat = await stat(filePath)
  const totalSize = fileStat.size

  if (totalSize <= STREAM_THRESHOLD) {
    return await readTextFile(filePath)
  }

  const fileHandle = await fsOpen(filePath, { read: true })
  const decoder = new TextDecoder('utf-8')
  const chunks: string[] = []
  let bytesReadTotal = 0

  try {
    const buffer = new Uint8Array(CHUNK_SIZE)
    while (true) {
      const n = await fileHandle.read(buffer)
      if (n === null || n === 0) break

      bytesReadTotal += n
      chunks.push(decoder.decode(buffer.subarray(0, n), { stream: true }))

      if (onProgress && totalSize > 0) {
        onProgress(Math.min(99, Math.round((bytesReadTotal / totalSize) * 100)))
      }
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    chunks.push(decoder.decode())
    if (onProgress) onProgress(100)
    return chunks.join('')
  } finally {
    await fileHandle.close()
  }
}

export async function writeSessionFile(data: SessionData) {
  const tempDir = await getTempDir()
  const file = await join(tempDir, 'session.json')
  await writeTextFile(file, JSON.stringify(data, null, 2))
}

export async function loadSessionFromTemp(): Promise<{
  tabs: TabItem[]
  activeTab: string
  tabPosition: 'top' | 'bottom'
} | null> {
  try {
    const tempDir = await getTempDir()
    const sessionFile = await join(tempDir, 'session.json')
    if (!(await exists(sessionFile))) return null

    const raw = await readTextFile(sessionFile)
    const session: SessionData = JSON.parse(raw)
    if (!Array.isArray(session.tabs) || session.tabs.length === 0) return null

    const tabs: TabItem[] = []
    for (const meta of session.tabs) {
      let content = ''
      let isDirty = meta.isDirty
      const tmpFile = await join(tempDir, `${meta.id}.tmp`)

      // 核心修正：只要 temp 目录中存在对应的 .tmp 缓存文件，无条件优先加载缓存内容
      if (await exists(tmpFile)) {
        content = await readFileSmart(tmpFile)
        isDirty = true
      } else if (meta.filePath && (await exists(meta.filePath))) {
        content = await readFileSmart(meta.filePath)
        isDirty = false
      }

      tabs.push({
        ...meta,
        isDirty,
        encoding: meta.encoding || 'UTF-8',
        content,
        isLoading: false,
        loadProgress: 100
      })
    }

    return {
      tabs,
      activeTab: session.activeTab || tabs[0].id,
      tabPosition: session.tabPosition || 'top'
    }
  } catch (e) {
    console.error('读取临时缓存失败:', e)
    return null
  }
}
