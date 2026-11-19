<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Check, Trash2 } from '@lucide/vue'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  encodeBase64Utf8,
  decodeBase64Utf8,
  encodeUrlStr,
  decodeUrlStr
} from '@/utils/textTools'

const open = defineModel<boolean>('open', { default: false })
const mode = defineModel<'base64' | 'url'>('mode', { default: 'base64' })

const props = defineProps<{
  initialText?: string
}>()

const { t } = useI18n()
const inputText = ref('')
const outputText = ref('')
const errorMsg = ref('')
const copied = ref(false)

// 每次打开弹窗时，如果编辑器有选中的单行/多行文本，自动填入输入框
watch(open, (isOpen) => {
  if (isOpen) {
    errorMsg.value = ''
    copied.value = false
    if (props.initialText) {
      inputText.value = props.initialText
      outputText.value = ''
    }
  }
})

// 切换 Base64 / URL 模式时清空错误提示
watch(mode, () => {
  errorMsg.value = ''
})

const handleEncode = () => {
  errorMsg.value = ''
  if (!inputText.value) {
    outputText.value = ''
    return
  }
  try {
    outputText.value = mode.value === 'base64'
        ? encodeBase64Utf8(inputText.value)
        : encodeUrlStr(inputText.value)
  } catch (e: any) {
    errorMsg.value = e?.message || String(e)
  }
}

const handleDecode = () => {
  errorMsg.value = ''
  if (!inputText.value) {
    outputText.value = ''
    return
  }
  try {
    outputText.value = mode.value === 'base64'
        ? decodeBase64Utf8(inputText.value)
        : decodeUrlStr(inputText.value)
  } catch {
    errorMsg.value = mode.value === 'base64'
        ? t('topMenu.tools.invalidBase64')
        : t('topMenu.tools.invalidUrl')
  }
}

// 将输出框的内容交换到输入框，方便连续反向转换
const handleSwap = () => {
  errorMsg.value = ''
  const temp = inputText.value
  inputText.value = outputText.value
  outputText.value = temp
}

const handleCopy = async () => {
  if (!outputText.value) return
  try {
    await writeText(outputText.value)
  } catch {
    await navigator.clipboard.writeText(outputText.value)
  }
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}

const handleClear = () => {
  inputText.value = ''
  outputText.value = ''
  errorMsg.value = ''
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-140 rounded-none select-none">
      <DialogHeader>
        <DialogTitle class="text-base">{{ t('topMenu.tools.codecTitle') }}</DialogTitle>
      </DialogHeader>

      <!-- 模式切换标签：Base64 / URL -->
      <Tabs v-model="mode" class="w-full">
        <TabsList class="grid w-full grid-cols-2 rounded-none h-8 p-0.5">
          <TabsTrigger value="base64" class="rounded-none text-xs h-7">
            {{ t('topMenu.tools.base64Tab') }}
          </TabsTrigger>
          <TabsTrigger value="url" class="rounded-none text-xs h-7">
            {{ t('topMenu.tools.urlTab') }}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <!-- 输入区域 -->
      <div class="space-y-2">
        <textarea
            v-model="inputText"
            rows="5"
            :placeholder="t('topMenu.tools.inputPlaceholder')"
            class="w-full resize-none border border-border bg-background p-2.5 font-mono text-xs outline-none focus:border-primary select-text"
        />

        <!-- 中间操作按钮栏 -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <Button size="sm" class="h-7 rounded-none text-xs gap-1" @click="handleEncode">
              <ArrowDown class="h-3.5 w-3.5" />
              <span>{{ t('topMenu.tools.encode') }}</span>
            </Button>
            <Button size="sm" variant="secondary" class="h-7 rounded-none text-xs gap-1" @click="handleDecode">
              <ArrowUp class="h-3.5 w-3.5" />
              <span>{{ t('topMenu.tools.decode') }}</span>
            </Button>
            <Button size="sm" variant="outline" class="h-7 rounded-none text-xs gap-1" @click="handleSwap">
              <ArrowUpDown class="h-3.5 w-3.5" />
              <span>{{ t('topMenu.tools.swap') }}</span>
            </Button>
          </div>

          <div class="flex items-center gap-1.5">
            <Button
                size="sm"
                variant="outline"
                class="h-7 rounded-none text-xs gap-1"
                :disabled="!outputText"
                @click="handleCopy"
            >
              <Check v-if="copied" class="h-3.5 w-3.5 text-emerald-500" />
              <Copy v-else class="h-3.5 w-3.5" />
              <span>{{ copied ? t('topMenu.tools.copied') : t('topMenu.tools.copyResult') }}</span>
            </Button>
            <Button size="sm" variant="ghost" class="h-7 rounded-none text-xs gap-1" @click="handleClear">
              <Trash2 class="h-3.5 w-3.5" />
              <span>{{ t('topMenu.tools.clear') }}</span>
            </Button>
          </div>
        </div>

        <!-- 错误提示 -->
        <p v-if="errorMsg" class="text-xs text-destructive">
          {{ errorMsg }}
        </p>

        <!-- 结果输出区域 -->
        <textarea
            v-model="outputText"
            readonly
            rows="5"
            :placeholder="t('topMenu.tools.outputPlaceholder')"
            class="w-full resize-none border border-border bg-muted/40 p-2.5 font-mono text-xs outline-none select-text"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
