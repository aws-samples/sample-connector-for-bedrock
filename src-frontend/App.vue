<template>
  <ConfigProvider :locale="en">
    <transition name="fade" mode="out-in">
      <router-view />
    </transition>
  </ConfigProvider>
</template>
<script setup>
import { provide } from "vue";
import ui_en from "kui-vue/components/locale/en";
import local_en from "./lang/en";
const en = {
  ...ui_en,
  ...local_en,
};

import { t } from "./lang/index";
const $t = (key) => {
  return t(en, key);
};

provide("$t", $t);
</script>
