<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { message } from '@tauri-apps/plugin-dialog'
import {
  FileIcon, FolderIcon, InfoIcon, SaveIcon, SettingsIcon,
  RedoIcon, UndoIcon, Scissors, CopyIcon, ClipboardPaste, Search, Replace,
  Minus, Square, Copy, X, Braces, Minimize2, Binary, Link2
} from '@lucide/vue'
import {
  Menubar, MenubarCheckboxItem, MenubarContent, MenubarGroup, MenubarItem, MenubarMenu,
  MenubarRadioGroup, MenubarRadioItem, MenubarSeparator, MenubarShortcut, MenubarTrigger
} from '@/components/ui/menubar'
import { useI18n } from 'vue-i18n'

defineProps<{
  currentEncoding: string
  hasActiveTab: boolean
}>()

const emit = defineEmits<{
  (e: 'new-file'): void
  (e: 'open-file'): void
  (e: 'save-file'): void
  (e: 'save-as'): void
  (e: 'change-encoding', encoding: string): void
  (e: 'format-json'): void
  (e: 'minify-json'): void
  (e: 'open-codec', mode: 'base64' | 'url'): void
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'cut'): void
  (e: 'copy'): void
  (e: 'paste'): void
  (e: 'find'): void
  (e: 'replace'): void
  (e: 'open-about'): void
}>()

const { t, locale } = useI18n()
const appWindow = getCurrentWindow()
const isMaximized = ref(false)
let unlistenResize: (() => void) | null = null

// 检测是否为 Windows 系统
const isWindows = navigator.userAgent.toLowerCase().includes('windows')
const hasContextMenu = ref(false)

const updateMaximizedState = async () => {
  isMaximized.value = await appWindow.isMaximized()
}

onMounted(async () => {
  await updateMaximizedState()
  unlistenResize = await appWindow.onResized(updateMaximizedState)

  if (isWindows) {
    try {
      hasContextMenu.value = await invoke<boolean>('check_windows_context_menu')
    } catch (e) {
      console.error('检查右键菜单状态失败:', e)
    }
  }
})

onUnmounted(() => { if (unlistenResize) unlistenResize() })

// 切换添加/移除 Windows 右键菜单
const handleToggleContextMenu = async (checked: boolean) => {
  try {
    const res = await invoke<boolean>('toggle_windows_context_menu', {
      enable: checked,
      menuTitle: t('topMenu.setting.winContextMenuLabel')
    })
    hasContextMenu.value = res
    await message(
        res ? t('topMenu.setting.winContextMenuAdded') : t('topMenu.setting.winContextMenuRemoved'),
        { title: t('topMenu.setting.self'), kind: 'info' }
    )
  } catch (e) {
    console.error('设置右键菜单失败:', e)
  }
}

const switchLang = (lang: 'zh-CN' | 'en-US') => {
  locale.value = lang
  localStorage.setItem('edit-fast-locale', lang)
}
</script>

<template>
  <div class="flex h-9 w-full items-center justify-between border-b bg-background select-none">
    <Menubar class="border-none bg-transparent shadow-none h-9 px-1">
      <MenubarMenu>
        <MenubarTrigger>{{ t('topMenu.file.self') }}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem @click="emit('new-file')">
            <FileIcon /> {{ t('topMenu.file.new') }} <MenubarShortcut>Ctrl+N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem @click="emit('open-file')">
            <FolderIcon /> {{ t('topMenu.file.open') }} <MenubarShortcut>Ctrl+O</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem :disabled="!hasActiveTab" @click="emit('save-file')">
            <SaveIcon /> {{ t('topMenu.file.save') }} <MenubarShortcut>Ctrl+S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem :disabled="!hasActiveTab" @click="emit('save-as')">
            <SaveIcon /> {{ t('topMenu.file.saveAs') }} <MenubarShortcut>Ctrl+Shift+S</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{{ t('topMenu.edit.self') }}</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarItem :disabled="!hasActiveTab" @click="emit('undo')">
              <UndoIcon /> {{ t('topMenu.edit.undo') }} <MenubarShortcut>Ctrl+Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem :disabled="!hasActiveTab" @click="emit('redo')">
              <RedoIcon /> {{ t('topMenu.edit.redo') }} <MenubarShortcut>Ctrl+Y</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem :disabled="!hasActiveTab" @click="emit('cut')">
              <Scissors /> {{ t('topMenu.edit.cut') }} <MenubarShortcut>Ctrl+X</MenubarShortcut>
            </MenubarItem>
            <MenubarItem :disabled="!hasActiveTab" @click="emit('copy')">
              <CopyIcon /> {{ t('topMenu.edit.copy') }} <MenubarShortcut>Ctrl+C</MenubarShortcut>
            </MenubarItem>
            <MenubarItem :disabled="!hasActiveTab" @click="emit('paste')">
              <ClipboardPaste /> {{ t('topMenu.edit.paste') }} <MenubarShortcut>Ctrl+V</MenubarShortcut>
            </MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{{ t('topMenu.search.self') }}</MenubarTrigger>
        <MenubarContent>
          <MenubarGroup>
            <MenubarItem :disabled="!hasActiveTab" @click="emit('find')">
              <Search /> {{ t('topMenu.search.find') }} <MenubarShortcut>Ctrl+F</MenubarShortcut>
            </MenubarItem>
            <MenubarItem :disabled="!hasActiveTab" @click="emit('replace')">
              <Replace /> {{ t('topMenu.search.replace') }} <MenubarShortcut>Ctrl+H</MenubarShortcut>
            </MenubarItem>
          </MenubarGroup>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{{ t('topMenu.code.self') }}</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup :model-value="currentEncoding" @update:model-value="(val: any) => emit('change-encoding', val)">
            <MenubarRadioItem value="UTF-8">UTF-8</MenubarRadioItem>
            <MenubarRadioItem value="UTF-16LE">UTF-16 LE</MenubarRadioItem>
            <MenubarRadioItem value="GBK">GBK</MenubarRadioItem>
            <MenubarRadioItem value="ASCII">ASCII</MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>

      <!-- 工具菜单 -->
      <MenubarMenu>
        <MenubarTrigger>{{ t('topMenu.tools.self') }}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem :disabled="!hasActiveTab" @click="emit('format-json')">
            <Braces /> {{ t('topMenu.tools.formatJson') }}
          </MenubarItem>
          <MenubarItem :disabled="!hasActiveTab" @click="emit('minify-json')">
            <Minimize2 /> {{ t('topMenu.tools.minifyJson') }}
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem @click="emit('open-codec', 'base64')">
            <Binary />{{ t('topMenu.tools.base64Tool') }}
          </MenubarItem>
          <MenubarItem @click="emit('open-codec', 'url')">
            <Link2 />{{ t('topMenu.tools.urlTool') }}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{{ t('topMenu.lang.self') }}</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup :model-value="locale" @update:model-value="(val: any) => switchLang(val)">
            <MenubarRadioItem value="zh-CN">简体中文</MenubarRadioItem>
            <MenubarRadioItem value="en-US">English</MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>

      <!-- 设置菜单：仅在 Windows 系统显示右键菜单开关 -->
      <MenubarMenu>
        <MenubarTrigger>{{ t('topMenu.setting.self') }}</MenubarTrigger>
        <MenubarContent>
          <MenubarCheckboxItem
              v-if="isWindows"
              :model-value="hasContextMenu"
              @update:model-value="handleToggleContextMenu"
          >
            {{ t('topMenu.setting.winContextMenu') }}
          </MenubarCheckboxItem>
          <MenubarSeparator v-if="isWindows" />
          <MenubarItem>
            <SettingsIcon /> {{ t('topMenu.setting.self') }}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{{ t('topMenu.about.self') }}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem @click="emit('open-about')">
            <InfoIcon /> {{ t('topMenu.about.title') }}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>

    <div data-tauri-drag-region class="h-full flex-1 cursor-default" @dblclick="appWindow.toggleMaximize()" />

    <div class="flex h-full shrink-0 items-center">
      <button type="button" :title="t('window.minimize')" class="inline-flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" @click="appWindow.minimize()">
        <Minus class="h-4 w-4" />
      </button>
      <button type="button" :title="isMaximized ? t('window.restore') : t('window.maximize')" class="inline-flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" @click="appWindow.toggleMaximize()">
        <Copy v-if="isMaximized" class="h-3.5 w-3.5 rotate-180" />
        <Square v-else class="h-3.5 w-3.5" />
      </button>
      <button type="button" :title="t('window.close')" class="inline-flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors" @click="appWindow.close()">
        <X class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
