<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { FileCode2 } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const appVersion = ref('')
const appAuthors = ref('Wenda')
const websiteUrl = 'https://github.com/zhoujunzhao/EditFast'

onMounted(async () => {
  try {
    appVersion.value = await getVersion()
    const authors = await invoke<string>('get_app_authors')
    if (authors) appAuthors.value = authors
  } catch {
    // 浏览器预览回退默认值
  }
})

const handleOpenWebsite = async () => {
  try {
    await openUrl(websiteUrl)
  } catch {
    window.open(websiteUrl, '_blank')
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-105 rounded-none select-none">
      <DialogHeader>
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center border bg-muted">
            <FileCode2 class="h-5 w-5 text-primary" />
          </div>
          <div>
            <DialogTitle class="text-base">{{ t('topMenu.about.title') }}</DialogTitle>
            <DialogDescription class="text-xs mt-0.5">
              {{ t('topMenu.about.version') }}: v{{ appVersion }}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div class="py-3 text-xs text-muted-foreground space-y-2 border-y border-border/60">
        <p class="text-foreground leading-relaxed">{{ t('topMenu.about.desc') }}</p>
        <p>{{ t('topMenu.about.author') }}: {{ appAuthors }}</p>
        <p class="flex items-center gap-1">
          <span>{{ t('topMenu.about.website') }}:</span>
          <a
              :href="websiteUrl"
              class="text-primary underline underline-offset-2 hover:opacity-80 cursor-pointer"
              @click.prevent="handleOpenWebsite"
          >
            {{ websiteUrl }}
          </a>
        </p>
        <p>{{ t('topMenu.about.techStack') }}: Tauri 2 · Vue 3 · TypeScript · CodeMirror 6 · shadcn-vue</p>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" class="rounded-none" @click="open = false">
          {{ t('topMenu.about.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
