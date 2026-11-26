<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, Copy, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const appWindow = getCurrentWindow()
const isMaximized = ref(false)
let unlistenResize: (() => void) | null = null

const updateMaximizedState = async () => {
  isMaximized.value = await appWindow.isMaximized()
}

onMounted(async () => {
  await updateMaximizedState()
  unlistenResize = await appWindow.onResized(updateMaximizedState)
})

onUnmounted(() => {
  if (unlistenResize) unlistenResize()
})
</script>

<template>
  <div
      data-tauri-drag-region
      class="h-full flex-1 cursor-default"
      @dblclick="appWindow.toggleMaximize()"
  />

  <div class="flex h-full shrink-0 items-center">
    <button
        type="button"
        :title="t('window.minimize')"
        class="inline-flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        @click="appWindow.minimize()"
    >
      <Minus class="h-4 w-4" />
    </button>
    <button
        type="button"
        :title="isMaximized ? t('window.restore') : t('window.maximize')"
        class="inline-flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        @click="appWindow.toggleMaximize()"
    >
      <Copy v-if="isMaximized" class="h-3.5 w-3.5 rotate-180" />
      <Square v-else class="h-3.5 w-3.5" />
    </button>
    <button
        type="button"
        :title="t('window.close')"
        class="inline-flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
        @click="appWindow.close()"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
</template>
