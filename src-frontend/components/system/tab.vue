<template>
  <div class="sys-tab-wrapper">
    <div class="sys-tab-box" ref="rootRef">
      <transition-group
        class="tab-inner-box"
        ref="tabBoxRef"
        tag="div"
        name="sys-tab"
        :time="300"
        @enter="animate.on.enter"
        @beforeEnter="animate.on.beforeEnter"
        @afterEnter="animate.on.afterEnter"
        @beforeLeave="animate.on.beforeLeave"
        @leave="animate.on.leave"
        @afterLeave="animate.on.afterLeave"
      >
        <div :class="cls(view)" v-for="view in views" :key="view.key">
          <Dropdown trigger="contextmenu" :key="view.fullPath">
            <div class="sys-tab-item-inner">
              <router-link
                :to="{
                  path: view.path,
                  query: view.query,
                  fullPath: view.fullPath,
                  params: view.params,
                }"
              >
                <Icon
                  class="sys-tab-icon"
                  :type="view.meta.icon"
                  v-if="view.meta.icon"
                />
                <span class="sys-tab-title">{{ $t(view.meta.title) || "-" }}</span>
                <Icon
                  :type="Close"
                  class="sys-tab-close"
                  @click.prevent.stop="close(view)"
                  :strokeWidth="40"
                />
              </router-link>
            </div>
            <template #overlay>
              <Menu @select="(e) => handle(e, view)">
                <MenuItem key="reload">重新加载</MenuItem>
                <MenuItem key="close">关闭</MenuItem>
                <MenuItem key="close-other">关闭其他</MenuItem>
                <MenuItem key="close-left">关闭左侧</MenuItem>
                <MenuItem key="close-right">关闭右侧</MenuItem>
              </Menu>
            </template>
          </Dropdown>
        </div>
      </transition-group>
      <!-- </draggable> -->
    </div>
    <Dropdown trigger="hover" v-if="showDrop" placement="bottom" arrow>
      <Button
        :icon="ChevronDown"
        theme="light"
        size="small"
        class="sys-tab-show-list-btn"
      ></Button>
      <template #overlay>
        <Menu @select="dropGo">
          <MenuItem
            :icon="kui[view.meta.icon]"
            v-for="view in views"
            :key="view.fullPath"
          >
            {{ $t(view.meta.title) }}
          </MenuItem>
        </Menu>
      </template>
    </Dropdown>
  </div>
</template>
<script setup>
import { ref, computed, watch, onMounted, onBeforeMount, nextTick,inject } from "vue";
import { getCurrentInstance } from "vue";
import * as kui from "kui-icons";
import { Close, ChevronDown, Loading } from "kui-icons";
import id from "hash-sum";
import { getTransitionHorProp } from "@/utils/transition";
const animate = getTransitionHorProp("tab-fade");
const { proxy } = getCurrentInstance();
const $t = inject("$t");
const showDrop = ref(false);
const observe = ref(null);
const rootRef = ref(null);
const tabBoxRef = ref(null);

const views = computed(() => proxy.$store.state.tabViews.views); //getters.views);
const current = computed(() => proxy.$route.fullPath);
const currentIndex = computed(() =>
  views.value.findIndex((v) => v.fullPath == current.value)
);

watch(
  () => proxy.$route,
  (newRoute) => {
    proxy.$store.commit("tabViews/addView", newRoute);
    nextTick(() => {
      scrollToCenter();
      setDropShow(_$(".sys-tab-box"), tabBoxRef.value?.$el);
    });
  }
);

onBeforeMount(() => {
  proxy.$store.commit("tabViews/addView", proxy.$route);
});

onMounted(() => {
  observe.value = new ResizeObserver((e) => {
    setDropShow(e[0].target, _$(".tab-inner-box"));
    scrollToCenter();
  });
  observe.value.observe(_$(".sys-tab-box"));
});

const dropGo = ({ key }) => {
  let view = views.value.findLast((x) => x.fullPath == key);
  go(view);
};

const _$ = (clsName) => {
  return document.querySelector(clsName);
};

const setDropShow = (outer, inner) => {
  if (!inner) return;
  showDrop.value = outer.offsetWidth < inner.offsetWidth;
};

const scrollToCenter = (animate = true) => {
  let box = tabBoxRef.value?.$el;
  let children = box?.children || [];
  for (let m of children) {
    if (m.className.indexOf("active") > -1) {
      const offset = m.offsetLeft;
      const scrollDistance =
        offset -
        parseFloat((rootRef.value.clientWidth / 2).toFixed(2)) +
        parseFloat((m.clientWidth / 2).toFixed(2));
      if (animate) {
        rootRef.value.scrollTo({ left: scrollDistance, behavior: "smooth" });
      } else {
        rootRef.value.scrollLeft = scrollDistance;
      }
      break;
    }
  }
};

const handle = ({ key }, view) => {
  let cur_index, select_index;
  switch (key) {
    case "reload":
      reload(view);
      break;
    case "close":
      close(view);
      break;
    case "close-other":
      proxy.$store.commit("tabViews/closeOtherView", view);
      if (current.value != view.fullPath) {
        go(view);
      }
      break;
    case "close-right":
      cur_index = views.value.findIndex((x) => x.fullPath == current.value);
      select_index = views.value.indexOf(view);
      if (current.value != view.fullPath && cur_index > select_index) {
        go(view);
      }
      proxy.$store.commit("tabViews/closeRightView", view);
      break;
    case "close-left":
      cur_index = views.value.findIndex((x) => x.fullPath == current.value);
      select_index = views.value.indexOf(view);
      if (current.value != view.fullPath && cur_index < select_index) {
        go(view);
      }
      proxy.$store.commit("tabViews/closeLeftView", view);
      break;
    default:
      break;
  }
};

const reload = (view) => {
  let currentId = id(proxy.$route.fullPath);
  if (currentId != view.key) {
    proxy.$store.commit("tabViews/reloadSelectView", view);
    return;
  }
  proxy.$store.commit("tabViews/reloadView", view);
};

const close = (view) => {
  let viewsArray = views.value;
  if (viewsArray.length == 1) return;
  if (view.fullPath == current.value) {
    let index = viewsArray.findIndex((x) => x.fullPath == view.fullPath);

    if (index == 0) {
      index = 1;
    } else if (index == viewsArray.length - 1) {
      index = viewsArray.length - 2;
    } else {
      index += 1;
    }
    let item = viewsArray[index];
    proxy.$store.commit("tabViews/closeView", view);
    go(item);
  } else {
    proxy.$store.commit("tabViews/closeView", view);
  }
};

const go = (item) => {
  proxy.$router.push({
    path: item.path,
    query: item.query,
    fullPath: item.fullPath,
    params: item.params,
  });
};

const cls = (item) => {
  let index = views.value.indexOf(item);
  return [
    "sys-tab-item",
    {
      "sys-tab-item-active": item.fullPath == current.value,
      "sys-tab-item-first": index == 0,
      "sys-tab-item-prev": index == currentIndex.value - 1,
      "sys-tab-item-next": index == currentIndex.value + 1,
    },
  ];
};
</script>
<style lang="less">
.sys-tab-wrapper {
  display: flex;
  align-items: center;

  .sys-tab-show-list-btn.k-btn-sm {
    margin: 0 8px;
  }

  .sys-tab-box {
    display: flex;
    flex-wrap: nowrap;
    overflow: auto;
    gap: 2px;
    padding: 8px 0 0;
    flex: 1;

    &::-webkit-scrollbar {
      height: 0;
    }

    .tab-inner-box {
      display: flex;
      flex-wrap: nowrap;
      margin-left: 8px;
      height: 34px;
      transition: all 0.3s ease-in-out;
    }

    .sys-tab-item {
      display: inline-flex;
      position: relative;
      cursor: pointer;
      height: 26px;
      line-height: 26px;
      font-size: 12px;
      margin: 0 4px;
      &::before,
      &::after {
        content: "";
        position: absolute;
        width: 15px;
        height: 17px;
        background: none;
        bottom: 8px;
        z-index: 0;
      }

      &::before {
        box-shadow: 12px 12px 0px 9px var(--kui-color-bg-layout);
        border-radius: 0 0 12px 0;
        left: -15px;
        bottom: 2px;
        height: 16px;
        top: auto;
      }

      &::after {
        border-radius: 0 0 0 12px;
        box-shadow: -12px 12px 0px 9px var(--kui-color-bg-layout);
        right: -15px;
        top: 15px;
      }

      .sys-tab-item-inner {
        border-radius: 8px;
        z-index: 1;
        position: relative;
        &::before,
        &::after {
          content: "";
          position: absolute;
          width: 2px;
          height: 14px;
          background: var(--kui-color-item-hover);
          top: 6px;
        }
        &::before {
          left: -5px;
        }
        &::after {
          right: -5px;
        }

        &:hover {
          background: var(--kui-color-item-hover);
        }
        &:active {
          background: var(--kui-color-item-active);
        }
        a {
          padding: 0 8px;
          color: var(--kui-color-text);
          display: flex;
          text-decoration: none;
          align-items: center;
        }
      }

      .sys-tab-title {
        max-width: 120px;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }

      .sys-tab-icon {
        margin-right: 5px;
      }

      .sys-tab-close {
        margin-left: 5px;
        font-size: 15px;
        font-weight: bold;
        border-radius: 50%;
        padding: 0px;
        z-index: 10;

        &:hover {
          background-color: var(--kui-color-bg-component-hover);
        }
        &:active {
          background-color: var(--kui-color-bg-component-active);
        }
      }
    }
    .sys-tab-item-first,
    .sys-tab-item-next {
      .sys-tab-item-inner::before {
        background-color: transparent;
      }
    }
    .sys-tab-item-prev {
      .sys-tab-item-inner::after {
        background-color: transparent;
      }
    }

    .sys-tab-item-active {
      vertical-align: top;
      align-self: flex-start;
      justify-self: baseline;
      border-radius: 10px 10px 0 0;
      padding-bottom: 8px;
      position: relative;
      z-index: 100;
      background-color: var(--kui-color-bg);
      &::before {
        box-shadow: 12px 12px 0px 9px var(--kui-color-bg);
      }
      &::after {
        box-shadow: -12px 12px 0px 9px var(--kui-color-bg);
      }
      .sys-tab-item-inner {
        background: var(--kui-color-bg);
        position: relative;
        border-radius: 8px 8px 0 0;
        z-index: 1;
        &:hover {
          background: var(--kui-color-bg);
        }
        &::before,
        &::after {
          background-color: transparent;
        }
      }
    }
  }

  .tab-fade-leave-active {
    transition: width 0.3s;
    animation: fadeout 0.3s ease-in-out;
  }

  @keyframes fadeout {
    0% {
      opacity: 1;
    }

    100% {
      width: 0;
      opacity: 0;
    }
  }

  @-webkit-keyframes fadeout {
    0% {
      opacity: 1;
    }

    100% {
      width: 0;
      opacity: 0;
    }
  }
}

.sys-tab-enter,
.sys-tab-leave-to {
  transition: all 0.3s ease-in-out;
  opacity: 0;
  .sys-tab-item-inner {
    transition: all 0.3s ease-in-out;
  }
}
.sys-tab-enter-active,
.sys-tab-leave-active {
  transition: all 0.3s ease-in-out;
  .sys-tab-item-inner {
    transition: all 0.3s ease-in-out;
  }
}
/* 可选：显式定义 enter-to（其实默认 opacity:1，可省略） */
.sys-tab-enter-to,
.sys-tab-leave {
  opacity: 1;

  .sys-tab-item-inner {
    transition: all 0.3s ease-in-out;
  }
}

.k-dropdown-menu {
  max-height: calc(100vh - 100px);
  overflow: auto;
}

.k-dropdown-menu-item {
  height: 32px !important;
}
</style>
