<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Pin, PinOff, Copy } from '@lucide/vue'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import type { TabItem } from '@/utils/tabCache'

const props = defineProps<{
  tab: TabItem
  index: number
  tabs: TabItem[]
}>()

const emit = defineEmits<{
  (e: 'close-current', id: string): void
  (e: 'close-others', id: string): void
  (e: 'close-right', id: string): void
  (e: 'close-all'): void
  (e: 'toggle-pin', id: string): void
}>()

const { t } = useI18n()

const copyTabFilePath = async () => {
  if (!props.tab.filePath) return
  try {
    await writeText(props.tab.filePath)
  } catch {
    await navigator.clipboard.writeText(props.tab.filePath)
  }
}
</script>

<template>
  <ContextMenuContent class="w-44 rounded-none">
    <ContextMenuItem class="rounded-none text-xs" :disabled="!!tab.pinned" @click="emit('close-current', tab.id)">
      {{ t('tabs.closeCurrent') }}
    </ContextMenuItem>
    <ContextMenuItem
        class="rounded-none text-xs"
        :disabled="tabs.filter(item => !item.pinned && item.id !== tab.id).length === 0"
        @click="emit('close-others', tab.id)"
    >
      {{ t('tabs.closeOthers') }}
    </ContextMenuItem>
    <ContextMenuItem
        class="rounded-none text-xs"
        :disabled="tabs.slice(index + 1).filter(item => !item.pinned).length === 0"
        @click="emit('close-right', tab.id)"
    >
      {{ t('tabs.closeRight') }}
    </ContextMenuItem>
    <ContextMenuItem
        class="rounded-none text-xs"
        :disabled="tabs.filter(item => !item.pinned).length === 0"
        @click="emit('close-all')"
    >
      {{ t('tabs.closeAll') }}
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem class="rounded-none text-xs" @click="emit('toggle-pin', tab.id)">
      <PinOff v-if="tab.pinned" class="h-3.5 w-3.5" />
      <Pin v-else class="h-3.5 w-3.5" />
      <span>{{ tab.pinned ? t('tabs.unpinTab') : t('tabs.pinTab') }}</span>
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem class="rounded-none text-xs" :disabled="!tab.filePath" @click="copyTabFilePath">
      <Copy class="h-3.5 w-3.5" />
      <span>{{ t('tabs.copyFullPath') }}</span>
    </ContextMenuItem>
  </ContextMenuContent>
</template>
