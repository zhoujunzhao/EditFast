import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

// 优先读取本地缓存，默认回退到中文
const savedLocale = localStorage.getItem('edit-fast-locale') || 'zh-CN'

export const i18n = createI18n({
  legacy: false, // 启用 Vue 3 Composition API 模式
  locale: savedLocale,
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})
