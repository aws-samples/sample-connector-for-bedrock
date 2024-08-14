<template>
  <section class="sys-main">
    <transition name="route-fade" :time="50000">
      <keep-alive :include="keepViews" :max="100">
        <router-view :key="key" v-if="keepView" />
      </keep-alive>
    </transition>
  </section>
</template>
<script>
import { mapGetters } from 'vuex'
import './keepalive.js'
export default {
  name: 'AppMain',
  computed: {
    ...mapGetters(['keepViews', 'keepView']),
    key() {
      return this.$route.path;
    },
  },
}
</script>
<style lang="less">
@keyframes fadein {
  0% {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes fadeout {
  0% {
    opacity: 1;
  }

  to {
    opacity: 3;
  }
}

.sys-main {
  position: relative;
  height: 100%;
}

.route-fade-enter-active {
  transition: all .3s ease;
}

.route-fade-leave-active {
  transition: all .2s cubic-bezier(1.0, 0.5, 0.8, 1.0);
}

.route-fade-enter,
.route-fade-leave-to {
  position: absolute;
  left: 0;
  top: 0;
  // transform: translateX(20px);
  // transform: translateY(20px);
  // transform: scale3d(0.9, 0.9, 1);
  // background-color: #fff;
  opacity: 0;
  min-height: 100vh;
  min-width: 100vw;
  overflow: hidden;
}

</style>