<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getVersion } from '@tauri-apps/api/app'
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
const appVersion = ref('0.1.0')

onMounted(async () => {
  try {
    appVersion.value = await getVersion()
  } catch {
    // 浏览器预览回退默认版本号
  }
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[420px] rounded-none select-none">
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
