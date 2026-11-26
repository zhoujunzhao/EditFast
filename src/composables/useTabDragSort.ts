import { ref } from 'vue'

export function useTabDragSort(onMove: (fromIndex: number, toIndex: number) => Promise<void>) {
  const draggingIndex = ref<number | null>(null)
  const dragOverIndex = ref<number | null>(null)
  const isDraggingTab = ref(false)

  const handleTabPointerDown = (index: number, e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement)?.closest('[data-close-btn]')) {
      return
    }

    const startX = e.clientX
    const startY = e.clientY
    let started = false

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = Math.abs(moveEvent.clientX - startX)
      const dy = Math.abs(moveEvent.clientY - startY)

      if (!started && (dx > 5 || dy > 5)) {
        started = true
        isDraggingTab.value = true
        draggingIndex.value = index
        dragOverIndex.value = index
      }

      if (started) {
        const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        const tabEl = el?.closest('[data-tab-index]') as HTMLElement | null
        if (tabEl) {
          const hoverIdx = Number(tabEl.dataset.tabIndex)
          if (!Number.isNaN(hoverIdx)) {
            dragOverIndex.value = hoverIdx
          }
        }
      }
    }

    const onPointerUp = async () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)

      const fromIdx = draggingIndex.value
      const toIdx = dragOverIndex.value

      draggingIndex.value = null
      dragOverIndex.value = null

      if (started) {
        if (fromIdx !== null && toIdx !== null && fromIdx !== toIdx) {
          await onMove(fromIdx, toIdx)
        }
        requestAnimationFrame(() => {
          isDraggingTab.value = false
        })
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return {
    draggingIndex,
    dragOverIndex,
    isDraggingTab,
    handleTabPointerDown
  }
}
