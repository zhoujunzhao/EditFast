<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Plus, X, ArrowUpDown, Loader2 } from '@lucide/vue'
import CodeEditor from '@/components/layout/CodeEditor.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEditorTabs } from '@/composables/useEditorTabs'

const MIN_TAB_WIDTH = 100
const MAX_TAB_WIDTH = 160
const { t } = useI18n()

const {
  tabs, activeTab, tabPosition, currentTab, hasDirtyTabs,
  syncSession, addTab, openFile, saveActiveFile, saveActiveFileAs,
  saveAllFiles, setActiveEncoding, removeTab, togglePosition,
  handleContentChange, flushAllCaches
} = useEditorTabs()

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
const findActive = () => { if (activeTab.value) editorRefs.get(activeTab.value)?.openFind() }
const replaceActive = () => { if (activeTab.value) editorRefs.get(activeTab.value)?.openReplace() }

const onDblClickBlank = (e: MouseEvent) => {
  if (e.target === e.currentTarget) addTab()
}

defineExpose({
  currentTab, hasDirtyTabs, createNewTab: addTab, openFile,
  saveActiveFile, saveActiveFileAs, saveAllFiles,
  undoActive, redoActive, cutActive, copyActive, pasteActive,
  findActive, replaceActive, setActiveEncoding, flushAllCaches
})
</script>

<template>
  <div class="flex flex-col flex-1 h-full min-h-0 w-full border bg-background select-none overflow-hidden">
    <Tabs v-model="activeTab" @update:model-value="syncSession" orientation="horizontal" class="flex flex-1 min-h-0 w-full overflow-hidden" :class="tabPosition === 'top' ? 'flex-col' : 'flex-col-reverse'">
      <div @dblclick="onDblClickBlank" class="shrink-0 flex flex-row items-start justify-between bg-muted/50 border-border w-full cursor-default" :class="tabPosition === 'top' ? 'border-b' : 'border-t'">
        <TabsList @dblclick="onDblClickBlank" class="flex! flex-row flex-wrap items-center justify-start flex-1 min-w-0 h-auto! min-h-8 bg-transparent p-0 gap-0 rounded-none">
          <TabsTrigger v-for="tab in tabs" :key="tab.id" :value="tab.id" :style="{ minWidth: `${MIN_TAB_WIDTH}px`, maxWidth: `${MAX_TAB_WIDTH}px` }" class="flex-1 h-8 px-3 rounded-none border-r border-b border-border/60 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none flex items-center justify-between gap-2 text-xs overflow-hidden">
            <span class="truncate">{{ tab.title }}<span v-if="tab.isDirty" class="ml-1 text-primary">•</span></span>
            <span role="button" :title="t('tabs.closeTab')" class="shrink-0 p-0.5 rounded-none opacity-60 hover:opacity-100 hover:bg-muted-foreground/20" @click="removeTab(tab.id, $event)"><X class="w-3 h-3" /></span>
          </TabsTrigger>
        </TabsList>
        <div class="flex items-center gap-1 px-1.5 shrink-0 h-8">
          <button @click="addTab" :title="t('tabs.newTab')" class="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"><Plus class="w-4 h-4" /></button>
          <button @click="togglePosition" :title="tabPosition === 'top' ? t('tabs.dockBottomTip') : t('tabs.dockTopTip')" class="flex items-center gap-1 px-2 py-1 text-xs hover:bg-muted text-muted-foreground hover:text-foreground whitespace-nowrap">
            <ArrowUpDown class="w-3.5 h-3.5" /><span>{{ tabPosition === 'top' ? t('tabs.dockBottom') : t('tabs.dockTop') }}</span>
          </button>
        </div>
      </div>
      <div class="flex-1 flex flex-col min-h-0 w-full relative overflow-hidden">
        <TabsContent v-for="tab in tabs" :key="tab.id" :value="tab.id" class="flex-1 min-h-0 h-full w-full m-0 p-0 focus-visible:outline-none overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
          <div v-if="tab.isLoading" class="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 class="w-6 h-6 animate-spin text-primary" />
            <p class="text-xs">{{ t('tabs.loading', { percent: tab.loadProgress || 0 }) }}</p>
            <div class="w-48 h-1.5 bg-muted overflow-hidden"><div class="h-full bg-primary transition-all duration-150" :style="{ width: `${tab.loadProgress || 0}%` }" /></div>
          </div>
          <CodeEditor v-else :ref="(el) => setEditorRef(tab.id, el)" :key="tab.id" :model-value="tab.content" :file-name="tab.title" class="flex-1 h-full min-h-0 w-full" @update:model-value="handleContentChange" />
        </TabsContent>
        <div v-if="tabs.length === 0" class="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
          <p>{{ t('tabs.empty') }}</p>
          <button @click="addTab" class="px-3 py-1.5 border bg-muted/50 hover:bg-muted text-foreground text-xs">{{ t('tabs.newDocBtn') }}</button>
        </div>
      </div>
    </Tabs>
  </div>
</template>
