<template>
  <SubMenu
    v-if="
      item.children &&
      item.children.map((x) => !x.hidden).length > 0 &&
      !item.hidden
    "
    :key="item.key"
    :title="(item.meta.title)"
    :icon="kui[item.meta.icon]"
    :isPopup="isPopup"
  >
    <RecursiveMenu
      :item="item"
      :key="item.key"
      v-for="(item, x) in item.children"
    />
  </SubMenu>
  <MenuItem
    :key="item.key"
    :icon="kui[item.meta.icon]"
    :isPopup="isPopup"
    v-else-if="!item.hidden"
  >
    {{ $t(item.meta.title) }}
  </MenuItem>
</template>

<script setup>
import { inject } from "vue";
import RecursiveMenu from "./recursiveMenu.vue";
const $t = inject("$t");
import * as kui from "kui-icons";
const props = defineProps({
  item: Object,
  isPopup: Boolean,
});
</script>
