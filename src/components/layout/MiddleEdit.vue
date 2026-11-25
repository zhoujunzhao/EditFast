<script setup lang="ts">
import {nextTick, ref, watch} from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, X, ArrowUpDown, Loader2, Pin, PinOff, Copy} from '@lucide/vue'
import CodeEditor, { type SearchOptions } from '@/components/layout/CodeEditor.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useEditorTabs } from '@/composables/useEditorTabs'

const MIN_TAB_WIDTH = 60
const MAX_TAB_WIDTH = 120
const { t } = useI18n()

const {
  tabs, activeTab, tabPosition, currentTab, hasDirtyTabs,
  syncSession, addTab, openFile, saveActiveFile, saveActiveFileAs,
  saveAllFiles, setActiveEncoding, removeTab, closeOtherTabs, closeRightTabs, closeAllTabs,togglePinTab,
  togglePosition, handleContentChange, flushAllCaches, handleDroppedPaths, moveTab,
  formatActiveJson, minifyActiveJson, setWindowState
} = useEditorTabs()

// 基于 Pointer 坐标的标签拖拽排序
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
        await moveTab(fromIdx, toIdx)
      }
      requestAnimationFrame(() => {
        isDraggingTab.value = false
      })
    }
  }

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

const editorRefs = new Map<string, InstanceType<typeof CodeEditor>>()
const setEditorRef = (id: string, el: any) => {
  if (el) editorRefs.set(id, el)
  else editorRefs.delete(id)
}

const undoActive = () => { if (activeTab.value) editorRefs.get(activeTab.value)?.undo() }
const redoActive = () => { if (activeTab.value) editorRefs.get(activeTab.value)?.redo() }
const cutActive = () => { if (activeTab.value) editorRefs.get(activeTab.value)?.cut() }
const copyActive = () => { if (activeTab.value) editorRefs.get(activeTab.value)?.copy() }
const pasteActive = () => { if (activeTab.value) editorRefs.get(activeTab.value)?.paste() }

const getActiveSelectedText = () => {
  return activeTab.value ? editorRefs.get(activeTab.value)?.getSelectedText() || '' : ''
}
const syncSearchQuery = (opts: SearchOptions) => {
  return activeTab.value ? editorRefs.get(activeTab.value)?.syncSearchQuery(opts) || { current: 0, total: 0 } : { current: 0, total: 0 }
}
const execFindNext = (opts: SearchOptions) => {
  return activeTab.value ? editorRefs.get(activeTab.value)?.execFindNext(opts) || { current: 0, total: 0 } : { current: 0, total: 0 }
}
const execFindPrev = (opts: SearchOptions) => {
  return activeTab.value ? editorRefs.get(activeTab.value)?.execFindPrev(opts) || { current: 0, total: 0 } : { current: 0, total: 0 }
}
const execReplaceOne = (opts: SearchOptions) => {
  return activeTab.value ? editorRefs.get(activeTab.value)?.execReplaceOne(opts) || { current: 0, total: 0 } : { current: 0, total: 0 }
}
const execReplaceAll = (opts: SearchOptions) => {
  return activeTab.value ? editorRefs.get(activeTab.value)?.execReplaceAll(opts) || { current: 0, total: 0 } : { current: 0, total: 0 }
}
const clearSearch = () => {
  if (activeTab.value) editorRefs.get(activeTab.value)?.clearSearch()
}

const onDblClickBlank = (e: MouseEvent) => {
  if (e.target === e.currentTarget) addTab()
}

const copyTabFilePath = async (filePath: string | null) => {
  if (!filePath) return
  try {
    await writeText(filePath)
  } catch {
    await navigator.clipboard.writeText(filePath)
  }
}

defineExpose({
  currentTab, hasDirtyTabs, createNewTab: addTab, openFile,
  saveActiveFile, saveActiveFileAs, saveAllFiles,
  undoActive, redoActive, cutActive, copyActive, pasteActive,
  getActiveSelectedText, syncSearchQuery, execFindNext, execFindPrev,
  execReplaceOne, execReplaceAll, clearSearch,
  setActiveEncoding, flushAllCaches, handleDroppedPaths, formatActiveJson, minifyActiveJson,
  setWindowState
})

watch(activeTab, async (newId) => {
  if (newId) {
    await nextTick()
    editorRefs.get(newId)?.refreshLayout()
  }
})
</script>

<template>
  <div class="flex flex-col flex-1 h-full min-h-0 w-full border bg-background select-none overflow-hidden">
    <Tabs
        v-model="activeTab"
        @update:model-value="syncSession"
        orientation="horizontal"
        class="flex flex-1 min-h-0 w-full overflow-hidden gap-0"
        :class="tabPosition === 'top' ? 'flex-col' : 'flex-col-reverse'"
    >
      <!-- 顶部/底部标签栏 -->
      <div
          @dblclick="onDblClickBlank"
          class="shrink-0 flex flex-row items-start justify-between bg-muted/50 border-border w-full cursor-default"
          :class="tabPosition === 'top' ? 'border-b' : 'border-t'"
      >
        <TabsList
            @dblclick="onDblClickBlank"
            class="flex! flex-row flex-wrap items-center justify-start flex-1 min-w-0 h-auto! min-h-8 bg-transparent p-0 gap-0 rounded-none"
        >
          <ContextMenu v-for="(tab, index) in tabs" :key="tab.id">
            <ContextMenuTrigger
                class="flex-1 flex"
                :style="{ minWidth: `${MIN_TAB_WIDTH}px`, maxWidth: `${MAX_TAB_WIDTH}px` }"
            >
              <TabsTrigger
                  :value="tab.id"
                  :data-tab-index="index"
                  :title="tab.title"
                  @pointerdown="handleTabPointerDown(index, $event)"
                  :class="[
               isDraggingTab && draggingIndex === index ? 'opacity-40 cursor-grabbing' : '',
               isDraggingTab && dragOverIndex === index && draggingIndex !== index ? 'border-l-2 border-l-primary bg-accent/60' : ''
             ]"
                  class="w-full h-8 px-3 rounded-none border-r border-b border-border/60 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none flex items-center justify-between gap-2 text-xs overflow-hidden transition-opacity"
              >
             <span class="truncate pointer-events-none">
               {{ tab.title }}<span v-if="tab.isDirty" class="ml-1 text-primary">•</span>
             </span>

                <!-- 固定标签显示图钉图标，普通标签显示关闭按钮 -->
                <span
                    v-if="tab.pinned"
                    :title="t('tabs.unpinTab')"
                    class="shrink-0 p-0.5 text-primary/80 pointer-events-none"
                >
               <Pin class="w-3 h-3 rotate-45" />
             </span>
                <span
                    v-else
                    data-close-btn
                    role="button"
                    :title="t('tabs.closeTab')"
                    class="shrink-0 p-0.5 rounded-none opacity-60 hover:opacity-100 hover:bg-muted-foreground/20"
                    @click.stop="removeTab(tab.id, $event)"
                >
               <X class="w-3 h-3" />
             </span>
              </TabsTrigger>
            </ContextMenuTrigger>

            <ContextMenuContent class="w-44 rounded-none">
              <ContextMenuItem class="rounded-none text-xs" :disabled="!!tab.pinned" @click="removeTab(tab.id)">
                {{ t('tabs.closeCurrent') }}
              </ContextMenuItem>
              <ContextMenuItem class="rounded-none text-xs" :disabled="tabs.filter(item => !item.pinned && item.id !== tab.id).length === 0" @click="closeOtherTabs(tab.id)">
                {{ t('tabs.closeOthers') }}
              </ContextMenuItem>
              <ContextMenuItem class="rounded-none text-xs" :disabled="tabs.slice(index + 1).filter(item => !item.pinned).length === 0" @click="closeRightTabs(tab.id)">
                {{ t('tabs.closeRight') }}
              </ContextMenuItem>
              <ContextMenuItem class="rounded-none text-xs" :disabled="tabs.filter(item => !item.pinned).length === 0" @click="closeAllTabs()">
                {{ t('tabs.closeAll') }}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem class="rounded-none text-xs" @click="togglePinTab(tab.id)">
                <PinOff v-if="tab.pinned" class="h-3.5 w-3.5" />
                <Pin v-else class="h-3.5 w-3.5" />
                <span>{{ tab.pinned ? t('tabs.unpinTab') : t('tabs.pinTab') }}</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem class="rounded-none text-xs" :disabled="!tab.filePath" @click="copyTabFilePath(tab.filePath)">
                <Copy class="h-3.5 w-3.5" />
                <span>{{ t('tabs.copyFullPath') }}</span>
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </TabsList>

        <div class="flex items-center gap-1 px-1.5 shrink-0 h-8">
          <button type="button" @click="addTab" :title="t('tabs.newTab')" class="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground">
            <Plus class="w-4 h-4" />
          </button>
          <button type="button" @click="togglePosition" :title="tabPosition === 'top' ? t('tabs.dockBottomTip') : t('tabs.dockTopTip')" class="flex items-center gap-1 px-2 py-1 text-xs hover:bg-muted text-muted-foreground hover:text-foreground whitespace-nowrap">
            <ArrowUpDown class="w-3.5 h-3.5" />
            <span>{{ tabPosition === 'top' ? t('tabs.dockBottom') : t('tabs.dockTop') }}</span>
          </button>
        </div>
      </div>

      <!-- 编辑区域：使用 TabsContent 配合 v-if 仅渲染当前激活页 -->
      <div class="flex-1 flex flex-col min-h-0 w-full relative overflow-hidden">
        <template v-for="tab in tabs" :key="tab.id">
          <TabsContent
              v-if="activeTab === tab.id"
              :value="tab.id"
              class="flex-1 min-h-0 h-full w-full m-0 p-0 focus-visible:outline-none overflow-hidden flex flex-col"
          >
            <div v-if="tab.isLoading" class="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 class="w-6 h-6 animate-spin text-primary" />
              <p class="text-xs">{{ t('tabs.loading', { percent: tab.loadProgress || 0 }) }}</p>
              <div class="w-48 h-1.5 bg-muted overflow-hidden">
                <div class="h-full bg-primary transition-all duration-150" :style="{ width: `${tab.loadProgress || 0}%` }" />
              </div>
            </div>

            <CodeEditor
                v-else
                :key="tab.id"
                :ref="(el) => setEditorRef(tab.id, el)"
                :model-value="tab.content"
                :file-name="tab.title"
                class="flex-1 h-full min-h-0 w-full"
                @update:model-value="(val) => handleContentChange(tab.id, val)"
            />
          </TabsContent>
        </template>

        <div v-if="tabs.length === 0" class="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
          <p>{{ t('tabs.empty') }}</p>
          <button type="button" @click="addTab" class="px-3 py-1.5 border bg-muted/50 hover:bg-muted text-foreground text-xs">
            {{ t('tabs.newDocBtn') }}
          </button>
        </div>
      </div>
    </Tabs>
  </div>
</template>
