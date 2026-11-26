<script setup lang="ts">
import { reactive, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowDown,
  ArrowUp,
  Replace,
  ReplaceAll,
  X,
  ChevronRight,
  ChevronDown,
  CaseSensitive,
  WholeWord,
  Regex,
  GripHorizontal
} from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { SearchOptions } from './CodeEditor.vue'
import { useFloatingDrag } from '@/composables/useFloatingDrag'

const open = defineModel<boolean>('open', { default: false })
const showReplace = defineModel<boolean>('showReplace', { default: false })

const props = defineProps<{
  initialText?: string
  triggerKey?: number
  activeTabId?: string
  matchStat: { current: number; total: number }
}>()

const emit = defineEmits<{
  (e: 'query-change', opts: SearchOptions): void
  (e: 'find-next', opts: SearchOptions): void
  (e: 'find-prev', opts: SearchOptions): void
  (e: 'replace-one', opts: SearchOptions): void
  (e: 'replace-all', opts: SearchOptions): void
  (e: 'close'): void
}>()

const { t } = useI18n()
const searchInputRef = ref<any>(null)
const dialogRef = ref<HTMLElement | null>(null)
const handleRef = ref<HTMLElement | null>(null)

const { x, y, ensureInViewport } = useFloatingDrag(dialogRef, handleRef)

const form = reactive<SearchOptions>({
  search: '',
  replace: '',
  caseSensitive: false,
  wholeWord: false,
  regexp: false
})

const activateDialog = async () => {
  ensureInViewport()
  if (props.initialText) {
    form.search = props.initialText
  }
  emit('query-change', { ...form })
  await nextTick()
  const el = searchInputRef.value?.$el || searchInputRef.value
  el?.focus()
  el?.select()
}

watch(open, async (isOpen) => {
  if (isOpen) await activateDialog()
  else emit('close')
})

watch(() => props.triggerKey, async () => {
  if (open.value) await activateDialog()
})

watch(() => props.activeTabId, async (newTabId) => {
  if (open.value && newTabId) {
    await nextTick()
    emit('query-change', { ...form })
  }
})

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    open.value = false
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) emit('find-prev', { ...form })
    else emit('find-next', { ...form })
  }
}
</script>

<template>
  <div
      v-if="open"
      ref="dialogRef"
      :style="{ left: `${x}px`, top: `${y}px` }"
      @keydown="handleKeydown"
      class="fixed z-50 w-95 border border-border bg-background shadow-lg select-none"
  >
    <div
        ref="handleRef"
        class="flex h-6 w-full cursor-move items-center justify-between border-b border-border/60 bg-muted/60 px-2 text-[11px] text-muted-foreground"
    >
      <div class="flex items-center gap-1.5">
        <GripHorizontal class="h-3.5 w-3.5" />
        <span>{{ showReplace ? t('topMenu.search.replace') : t('topMenu.search.find') }}</span>
      </div>
      <button
          type="button"
          class="p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          @click="open = false"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <div class="flex items-start gap-1.5 p-2.5">
      <button
          type="button"
          class="mt-1 p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          @click="showReplace = !showReplace"
      >
        <ChevronDown v-if="showReplace" class="h-3.5 w-3.5" />
        <ChevronRight v-else class="h-3.5 w-3.5" />
      </button>

      <div class="flex-1 space-y-2">
        <div class="flex items-center gap-1">
          <Input
              ref="searchInputRef"
              v-model="form.search"
              :placeholder="t('topMenu.search.findPlaceholder')"
              class="h-7 rounded-none text-xs flex-1"
          />

          <button
              type="button"
              :title="t('topMenu.search.matchCase')"
              class="h-7 w-7 flex items-center justify-center border text-xs transition-colors"
              :class="form.caseSensitive ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-muted'"
              @click="form.caseSensitive = !form.caseSensitive"
          >
            <CaseSensitive class="h-3.5 w-3.5" />
          </button>

          <button
              type="button"
              :title="t('topMenu.search.wholeWord')"
              class="h-7 w-7 flex items-center justify-center border text-xs transition-colors"
              :class="form.wholeWord ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-muted'"
              @click="form.wholeWord = !form.wholeWord"
          >
            <WholeWord class="h-3.5 w-3.5" />
          </button>

          <button
              type="button"
              :title="t('topMenu.search.useRegex')"
              class="h-7 w-7 flex items-center justify-center border text-xs transition-colors"
              :class="form.regexp ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-muted'"
              @click="form.regexp = !form.regexp"
          >
            <Regex class="h-3.5 w-3.5" />
          </button>
        </div>

        <div class="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            <template v-if="!form.search" />
            <template v-else-if="matchStat.total > 0">
              {{ t('topMenu.search.matchCount', { current: matchStat.current, total: matchStat.total }) }}
            </template>
            <template v-else>
              {{ t('topMenu.search.noMatch') }}
            </template>
          </span>

          <div class="flex items-center gap-1">
            <Button
                variant="outline"
                size="icon"
                class="h-6 w-6 rounded-none"
                :disabled="matchStat.total === 0"
                :title="`${t('topMenu.search.findPrev')} (Shift+Enter)`"
                @click="emit('find-prev', { ...form })"
            >
              <ArrowUp class="h-3.5 w-3.5" />
            </Button>
            <Button
                variant="outline"
                size="icon"
                class="h-6 w-6 rounded-none"
                :disabled="matchStat.total === 0"
                :title="`${t('topMenu.search.findNext')} (Enter)`"
                @click="emit('find-next', { ...form })"
            >
              <ArrowDown class="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div v-if="showReplace" class="flex items-center gap-1 pt-1 border-t border-border/60">
          <Input
              v-model="form.replace"
              :placeholder="t('topMenu.search.replacePlaceholder')"
              class="h-7 rounded-none text-xs flex-1"
          />
          <Button
              variant="outline"
              size="icon"
              class="h-7 w-7 rounded-none shrink-0"
              :disabled="matchStat.total === 0"
              :title="t('topMenu.search.replaceOne')"
              @click="emit('replace-one', { ...form })"
          >
            <Replace class="h-3.5 w-3.5" />
          </Button>
          <Button
              variant="outline"
              size="icon"
              class="h-7 w-7 rounded-none shrink-0"
              :disabled="matchStat.total === 0"
              :title="t('topMenu.search.replaceAll')"
              @click="emit('replace-all', { ...form })"
          >
            <ReplaceAll class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
