<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { message } from '@tauri-apps/plugin-dialog'
import {
  FileIcon, FolderIcon, InfoIcon, SaveIcon, SettingsIcon,
  RedoIcon, UndoIcon, Scissors, CopyIcon, ClipboardPaste, Search, Replace,
  Braces, Minimize2, Binary, Link2
} from '@lucide/vue'
import {
  Menubar, MenubarCheckboxItem, MenubarContent, MenubarGroup, MenubarItem, MenubarMenu,
  MenubarRadioGroup, MenubarRadioItem, MenubarSeparator, MenubarShortcut, MenubarTrigger
} from '@/components/ui/menubar'
import { useI18n } from 'vue-i18n'
import WindowControls from './WindowControls.vue'

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
const isWindows = navigator.userAgent.toLowerCase().includes('windows')
const hasContextMenu = ref(false)

onMounted(async () => {
  if (isWindows) {
    try {
      hasContextMenu.value = await invoke<boolean>('check_windows_context_menu')
    } catch (e) {
      console.error('检查右键菜单状态失败:', e)
    }
  }
})

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
            <MenubarRadioItem :disabled="!hasActiveTab" value="UTF-8">UTF-8</MenubarRadioItem>
            <MenubarRadioItem :disabled="!hasActiveTab" value="UTF-16LE">UTF-16 LE</MenubarRadioItem>
            <MenubarRadioItem :disabled="!hasActiveTab" value="GBK">GBK</MenubarRadioItem>
            <MenubarRadioItem :disabled="!hasActiveTab" value="ASCII">ASCII</MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>

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

    <WindowControls />
  </div>
</template>
