import { watchImmediate, exists } from '@tauri-apps/plugin-fs'

export class FileWatcherManager {
  private watchers = new Map<string, () => void>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private selfSavingPaths = new Set<string>()
  private promptingIds = new Set<string>()

  // 标记本编辑器正在自行保存，防止触发外部修改回调
  markSelfSaving(filePath: string) {
    this.selfSavingPaths.add(filePath)
    setTimeout(() => {
      this.selfSavingPaths.delete(filePath)
    }, 1000)
  }

  isSelfSaving(filePath: string) {
    return this.selfSavingPaths.has(filePath)
  }

  // 启动对指定标签文件的监控
  async start(
    tabId: string,
    filePath: string,
    onExternalChange: () => Promise<void>
  ) {
    this.stop(tabId)
    try {
      const unwatch = await watchImmediate(
        filePath,
        (event) => {
          if (
            typeof event.type === 'object' &&
            ('modify' in event.type || 'create' in event.type)
          ) {
            this.scheduleTrigger(tabId, filePath, onExternalChange)
          }
        },
        { recursive: false }
      )
      this.watchers.set(tabId, unwatch)
    } catch (e) {
      console.error(`监听文件失败 (${filePath}):`, e)
    }
  }

  private scheduleTrigger(
    tabId: string,
    filePath: string,
    onExternalChange: () => Promise<void>
  ) {
    if (this.isSelfSaving(filePath)) return
    if (this.timers.has(tabId)) clearTimeout(this.timers.get(tabId)!)

    const timer = setTimeout(async () => {
      this.timers.delete(tabId)
      if (this.isSelfSaving(filePath)) return
      if (!(await exists(filePath))) return
      if (this.promptingIds.has(tabId)) return

      this.promptingIds.add(tabId)
      try {
        await onExternalChange()
      } finally {
        this.promptingIds.delete(tabId)
      }
    }, 250)

    this.timers.set(tabId, timer)
  }

  stop(tabId: string) {
    if (this.timers.has(tabId)) {
      clearTimeout(this.timers.get(tabId)!)
      this.timers.delete(tabId)
    }
    const unwatch = this.watchers.get(tabId)
    if (unwatch) {
      unwatch()
      this.watchers.delete(tabId)
    }
  }

  stopAll() {
    for (const tabId of this.watchers.keys()) {
      this.stop(tabId)
    }
  }
}
