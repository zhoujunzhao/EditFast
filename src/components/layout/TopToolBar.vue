<script setup lang="ts">
import {
  FilePlus2,
  FolderOpen,
  Save,
  SaveAll,
  Undo2,
  Redo2
} from '@lucide/vue'
import { ButtonGroup } from '@/components/ui/button-group'
import { Button } from '@/components/ui/button'
import { useI18n } from 'vue-i18n'

defineProps<{
  hasActiveTab: boolean
  hasDirtyTabs: boolean
}>()

const emit = defineEmits<{
  (e: 'new-file'): void
  (e: 'open-file'): void
  (e: 'save-file'): void
  (e: 'save-all'): void
  (e: 'undo'): void
  (e: 'redo'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex h-9 w-full items-center gap-2 border-b bg-muted/20 px-2 select-none">
    <!-- 文件操作组 -->
    <ButtonGroup>
      <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 rounded-none"
          :title="`${t('topMenu.file.new')} (Ctrl+N)`"
          @click="emit('new-file')"
      >
        <FilePlus2 class="h-4 w-4" />
      </Button>

      <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 rounded-none"
          :title="`${t('topMenu.file.open')} (Ctrl+O)`"
          @click="emit('open-file')"
      >
        <FolderOpen class="h-4 w-4" />
      </Button>

      <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 rounded-none"
          :disabled="!hasActiveTab"
          :title="`${t('topMenu.file.save')} (Ctrl+S)`"
          @click="emit('save-file')"
      >
        <Save class="h-4 w-4" />
      </Button>

      <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 rounded-none"
          :disabled="!hasDirtyTabs"
          :title="`${t('topMenu.file.saveAll')} (Ctrl+Alt+S)`"
          @click="emit('save-all')"
      >
        <SaveAll class="h-4 w-4" />
      </Button>
    </ButtonGroup>

    <div class="h-4 w-px bg-border" />

    <!-- 编辑操作组 -->
    <ButtonGroup>
      <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 rounded-none"
          :disabled="!hasActiveTab"
          :title="`${t('topMenu.edit.undo')} (Ctrl+Z)`"
          @click="emit('undo')"
      >
        <Undo2 class="h-4 w-4" />
      </Button>

      <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 rounded-none"
          :disabled="!hasActiveTab"
          :title="`${t('topMenu.edit.redo')} (Ctrl+Y)`"
          @click="emit('redo')"
      >
        <Redo2 class="h-4 w-4" />
      </Button>
    </ButtonGroup>
  </div>
</template>
