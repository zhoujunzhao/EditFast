<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TabItem } from '@/utils/tabCache'

const props = defineProps<{
  activeTabInfo: TabItem | null
}>()

const { t } = useI18n()

const charCount = computed(() => {
  return props.activeTabInfo ? props.activeTabInfo.content.length : 0
})
</script>

<template>
  <!-- 左侧：保存状态与本地路径 -->
  <div class="flex items-center gap-3 min-w-0">
    <template v-if="activeTabInfo">
      <span v-if="!activeTabInfo.filePath" class="text-amber-600 dark:text-amber-400 shrink-0">
        {{ t('status.draft') }}
      </span>
      <span v-else-if="activeTabInfo.isDirty" class="text-amber-600 dark:text-amber-400 shrink-0">
        {{ t('status.dirtyCached') }}
      </span>
      <span v-else class="text-emerald-600 dark:text-emerald-400 shrink-0">
        {{ t('status.saved') }}
      </span>

      <span v-if="activeTabInfo.filePath" class="truncate opacity-75">
        {{ activeTabInfo.filePath }}
      </span>
    </template>

    <span v-else>{{ t('status.ready') }}</span>
  </div>

  <!-- 右侧：编码格式与字符数统计 -->
  <div v-if="activeTabInfo" class="flex items-center gap-3 shrink-0 pl-2">
    <span>{{ activeTabInfo.encoding }}</span>
    <span class="border-l pl-3 border-border">{{ t('status.chars') }}: {{ charCount }}</span>
  </div>
</template>
