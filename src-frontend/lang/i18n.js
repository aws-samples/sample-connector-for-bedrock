import VueI18n from 'vue-i18n'
import Vue from 'vue'

import en from 'kui-vue/components/locale/lang/en'
import zh from 'kui-vue/components/locale/lang/zh-CN'



import sys_zh from './zh'
import sys_en from './en'

Vue.use(VueI18n)

let lang = localStorage.getItem('lang') || 'en'

const i18n = new VueI18n({
  locale: lang, // set default locale
  messages: { en: { ...en, ...sys_en }, zh: { ...sys_zh, ...zh, } }, // set locale messages
  // messages: { en: Object.assign(en, sys_en), zh: Object.assign(zh, sys_zh) }, // set locale messages
})

export default i18n