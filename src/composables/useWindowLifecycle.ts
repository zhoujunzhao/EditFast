import { ref, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { WindowState } from '@/utils/tabCache'

export function useWindowLifecycle(deps: {
  onSaveWindowState: (state: WindowState) => Promise<void> | undefined
  onFlushCaches: () => Promise<void> | undefined
  onDropPaths: (paths: string[]) => Promise<void> | undefined
}) {
  const isDraggingOver = ref(false)
  let unlistenClose: (() => void) | null = null
  let unlistenDragDrop: (() => void) | null = null
  let unlistenWindowResize: (() => void) | null = null
  let resizeSaveTimer: ReturnType<typeof setTimeout> | null = null
  let lastNormalSize = { width: 1024, height: 768 }
  let isClosing = false

  const captureAndSaveWindowSize = async () => {
    try {
      const appWindow = getCurrentWindow()
      if (await appWindow.isMinimized()) return

      if (await appWindow.isMaximized()) {
        await deps.onSaveWindowState({
          width: lastNormalSize.width,
          height: lastNormalSize.height,
          maximized: true
        })
        return
      }

      const scale = await appWindow.scaleFactor()
      const physical = await appWindow.innerSize()
      const logical = physical.toLogical(scale)
      const w = Math.round(logical.width)
      const h = Math.round(logical.height)

      if (w >= 400 && h >= 300) {
        lastNormalSize = { width: w, height: h }
        await deps.onSaveWindowState({
          width: w,
          height: h,
          maximized: false
        })
      }
    } catch (e) {
      console.error('保存窗口大小失败:', e)
    }
  }

  onMounted(async () => {
    const appWindow = getCurrentWindow()

    try {
      if (!(await appWindow.isMaximized())) {
        const scale = await appWindow.scaleFactor()
        const physical = await appWindow.innerSize()
        const logical = physical.toLogical(scale)
        if (logical.width >= 400 && logical.height >= 300) {
          lastNormalSize = {
            width: Math.round(logical.width),
            height: Math.round(logical.height)
          }
        }
      }
    } catch {
      // 忽略初始化读取异常
    }

    unlistenWindowResize = await appWindow.onResized(() => {
      if (resizeSaveTimer) clearTimeout(resizeSaveTimer)
      resizeSaveTimer = setTimeout(() => {
        resizeSaveTimer = null
        void captureAndSaveWindowSize()
      }, 400)
    })

    unlistenClose = await appWindow.onCloseRequested(async (event) => {
      if (isClosing) return
      event.preventDefault()
      isClosing = true
      try {
        if (resizeSaveTimer) {
          clearTimeout(resizeSaveTimer)
          resizeSaveTimer = null
          await captureAndSaveWindowSize()
        }
        await deps.onFlushCaches()
      } finally {
        await appWindow.destroy()
      }
    })

    const webview = getCurrentWebview()
    unlistenDragDrop = await webview.onDragDropEvent(async (event) => {
      const type = event.payload.type
      if (type === 'over' || type === 'enter') {
        isDraggingOver.value = true
      } else if (type === 'leave') {
        isDraggingOver.value = false
      } else if (type === 'drop') {
        isDraggingOver.value = false
        const paths = event.payload.paths
        if (Array.isArray(paths) && paths.length > 0) {
          await deps.onDropPaths(paths)
        }
      }
    })
  })

  onUnmounted(() => {
    if (resizeSaveTimer) clearTimeout(resizeSaveTimer)
    if (unlistenWindowResize) unlistenWindowResize()
    if (unlistenClose) unlistenClose()
    if (unlistenDragDrop) unlistenDragDrop()
  })

  return { isDraggingOver }
}
