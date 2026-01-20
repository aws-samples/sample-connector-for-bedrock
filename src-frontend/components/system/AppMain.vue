<template>
  <section class="sys-main">
    <transition name="route-fade" :time="50000">
      <keep-alive :include="keepViews" :max="100">
        <router-view :key="key"/>
      </keep-alive>
    </transition>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { getCurrentInstance } from 'vue'

const { proxy } = getCurrentInstance()

const keepViews = computed(() => proxy.$store.getters.keepViews)
const key = computed(() => proxy.$store.getters.keepKey);
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
  animation: route-fade .1s;
  overflow: hidden;
}

.route-fade-leave-active {
  animation: route-fade .1s reverse;
}



.route-fade-enter-active {
  animation: fade-in .1s ease;
}

.route-fade-leave-active {
  animation: fade-out .1s cubic-bezier(1.0, 0.5, 0.8, 1.0);
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
