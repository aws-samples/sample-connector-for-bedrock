<template>
  <Sider class="sys-sider" :style="{ width: collapsed ? '60px' : '200px' }">
    <div class="logo-box">
      <transition>
        <span v-show="!collapsed">BRConnector</span>
      </transition>
      <Avatar v-if="collapsed">B</Avatar>
    </div>
    <Menu
      class="sys-menu"
      v-model="activeMenu"
      @openChange="openChange"
      :openKeys="openKeys"
      :inlineCollapsed="collapsed"
      style="border: none"
      @select="go"
      mode="inline"
    >
      <RecursiveMenu v-for="item in routes" :item="item" :key="item.key" />
    </Menu>
    <div class="sider-bottom">
      <Space>
        <a
          href="https://github.com/aws-samples/sample-connector-for-bedrock"
          target="_blank"
        >
          <Icon :type="LogoGithub" size="24" />
        </a>
        <span>{{ version }}</span>
      </Space>
      <!-- <Button :icon="!collapsed ? ChevronBack : ChevronForward" @click="toggle" class="btn-expand" /> -->
    </div>
  </Sider>
</template>
<script setup>
import { ref, onMounted, getCurrentInstance, watch } from "vue";
import RecursiveMenu from "./recursiveMenu.vue";
import { LogoGithub } from "kui-icons";
const { proxy } = getCurrentInstance();
import * as pkg from "../../../package.json";

const openKeys = ref([]);
const version = ref(pkg.version);
const collapsed = ref(false);

const props = defineProps({
  routes: {
    type: Array,
    default: () => [],
  },
});

const getPath = (tree, targetKey) => {
  const path = [];

  const dfs = (nodes) => {
    if (!Array.isArray(nodes)) return false;

    for (const node of nodes) {
      path.push(node.key);

      if (node.key === targetKey) return true;

      if (dfs(node.children)) return true;

      path.pop();
    }
    return false;
  };

  const found = dfs(tree);
  return found ? path.slice().reverse() : [];
};

const keys = getPath(props.routes, proxy.$route.path);
const activeMenu = ref(keys);

watch(
  () => proxy.$route,
  (nv) => {
    const keys = getPath(props.routes, proxy.$route.path);
    activeMenu.value = keys;
  },
);

onMounted(() => {
  let storedOpenKeys = JSON.parse(localStorage.getItem("openKeys") || "[]");
  openKeys.value = storedOpenKeys;
});

const openChange = (keys) => {
  localStorage.setItem("openKeys", JSON.stringify(keys));
  openKeys.value = keys;
};

const isOutPath = (path) => {
  return /^(https?:|mailto:|tel:)/.test(path);
};

const toggle = () => {
  collapsed.value = !collapsed.value;
  localStorage.setItem("collapsed", collapsed.value ? 1 : 0);
};

const go = ({ key }) => {
  if (isOutPath(key)) {
    return window.open(key);
  }
  proxy.$router.push(key);
};
</script>
<style lang="less">
.sys-sider {
  left: 0;
  position: relative;
  border-right: 1px solid var(--kui-color-border);
  transition: all 0.3s ease 0s;
  padding-bottom: 50px;

  .logo-box {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding: 16px 0 17px 16px;
    background: var(--kui-color-back);
    white-space: nowrap;
    overflow: hidden;

    .logo {
      margin-right: 8px;
      width: 30px;
    }

    font-size: 16px;
    font-weight: bold;
  }

  .sider-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    padding: 10px;
    width: 100%;
    box-sizing: border-box;
    background-color: var(--kui-color-back);
    // background-do
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
  }

  .sys-menu {
    max-height: calc(100% - 65px);
    overflow: auto;

    &::-webkit-scrollbar {
      width: 1px;
    }

    a {
      margin: 0;
      padding: 0;
      width: 100%;
    }
  }
}
</style>
