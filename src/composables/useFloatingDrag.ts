import type { Ref } from 'vue'
import { useDraggable, useWindowSize } from '@vueuse/core'

export function useFloatingDrag(
  dialogRef: Ref<HTMLElement | null>,
  handleRef: Ref<HTMLElement | null>
) {
  const { width: winWidth, height: winHeight } = useWindowSize()

  const { x, y } = useDraggable(dialogRef, {
    handle: handleRef,
    initialValue: { x: Math.max(20, window.innerWidth - 410), y: 80 },
    onMove(position) {
      const maxX = Math.max(20, winWidth.value - 380)
      const maxY = Math.max(40, winHeight.value - 120)
      position.x = Math.min(Math.max(8, position.x), maxX)
      position.y = Math.min(Math.max(36, position.y), maxY)
    }
  })

  const ensureInViewport = () => {
    if (x.value > winWidth.value - 100 || y.value > winHeight.value - 80) {
      x.value = Math.max(20, winWidth.value - 410)
      y.value = 80
    }
  }

  return { x, y, ensureInViewport }
}
