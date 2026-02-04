<template>
  <router-view v-slot="{ Component }">
    <transition name="fade">
      <keep-alive :include="keepViews" :max="100">
        <component :is="Component" :key="key" />
      </keep-alive>
    </transition>
  </router-view>
</template>
<script setup>
import { computed } from "vue";
import { useStore } from "vuex";
const store = useStore();
const keepViews = computed(() => store.getters.keepViews);
const key = computed(() => store.getters.keepKey);
</script>
<style lang="less">
@keyframes route-fade {
  0% {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.sys-main {
  position: relative;
  height: 100%;
}

.route-fade-enter-active,
.route-fade-enter-to {
  animation: route-fade 0.1s;
  overflow: hidden;
}

.route-fade-leave-active {
  animation: route-fade 0.1s reverse;
}

.route-fade-enter-active {
  animation: fade-in 0.1s ease;
}

.route-fade-leave-active {
  animation: fade-out 0.1s cubic-bezier(1, 0.5, 0.8, 1);
}

.route-fade-enter,
.route-fade-leave-to {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  min-height: 100vh;
  min-width: 100vw;
  overflow: hidden;
}
</style>
