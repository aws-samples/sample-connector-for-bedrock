<template>
  <ConfigProvider :locale="locale">
    <router-view v-slot="{ Component }">
      <transition name="fade">
        <component :is="Component" />
      </transition>
    </router-view>
  </ConfigProvider>
</template>
<script setup>
import { provide, ref, computed } from "vue";
import ui_en from "kui-vue/components/locale/en";
import ui_zh from "kui-vue/components/locale/zh-CN";
import local_en from "./lang/en";
import local_zh from "./lang/zh";

const lang = ref(localStorage.getItem("lang") || "en");
const messages = computed(() => (lang.value === "en" ? en : zh));
const locale = computed(() => messages.value);

const en = {
  ...ui_en,
  ...local_en,
};

const zh = {
  ...ui_zh,
  ...local_zh,
};

const t = (obj, path, defaultValue = null) => {
  if (obj == null || !path) return defaultValue;

  const keys = String(path).split(".").filter(Boolean);
  let cur = obj;

  for (const k of keys) {
    if (cur != null && Object.prototype.hasOwnProperty.call(cur, k)) {
      cur = cur[k];
    } else {
      return defaultValue;
    }
  }
  return cur;
};

const $t = (key, defaultValue = "") => t(messages.value, key, defaultValue);

const changeLang = (value) => {
  localStorage.setItem("lang", value);
  lang.value = value;
};

provide("$t", $t);
provide("changeLang", changeLang);
</script>
