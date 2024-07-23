<template>
  <Sider class="sys-sider" :style="{ width: collapsed ? '60px' : '200px' }">
    <div class="logo-box">
      <transition>
        <span v-show="!collapsed">BRConnector</span>
      </transition>
      <Avatar v-if="collapsed">B</Avatar>
    </div>
    <Menu mode="inline" class="sys-menu" v-model="activeMenu" @open-change="openChange" :open-keys="openKeys"
      :inline-collapsed="collapsed" style="border:none;" @click="go">
      <MenuItem v-for="route in routes" :route="route" :base-path="route.path" :key="route.path" />
    </Menu>
    <div class="sider-bottom">
      <Space>
        <a href="https://github.com/aws-samples/sample-connector-for-bedrock" target="_blank">
          <Icon :type="LogoGithub" size="24" />
        </a>
        <span>{{ version }}</span>
      </Space>
      <!-- <Button theme="light" :icon="!collapsed ? ChevronBack : ChevronForward" @click="toggle" class="btn-expand" /> -->
    </div>
  </Sider>
</template>
<script>
import MenuItem from './menuItem.vue'
import { ChevronBack, ChevronForward, LogoGithub } from 'kui-icons'
const pkg = require('../../../package.json')
export default {
  name: "side",
  data() {
    return {
      openKeys: [],
      version: pkg.version,
      collapsed: false,
      ChevronBack, ChevronForward, LogoGithub,
      activeMenu: [this.$route.path]
      // routes: this.$router.options.routes,
    }
  },
  components: { MenuItem },
  computed: {
    routes() {
      return this.$router.options.routes
    }
  },
  created() {
    let openKeys = JSON.parse(localStorage.getItem('openKeys') || '[]')
    this.openKeys = openKeys
  },
  methods: {
    openChange(keys) {
      localStorage.setItem('openKeys', JSON.stringify(keys))
    },
    isOutPath(path) {
      return /^(https?:|mailto:|tel:)/.test(path)
    },
    toggle() {
      this.collapsed = !this.collapsed;
    },
    go({ key }) {
      if (this.isOutPath(key)) {
        return window.open(key)
      }
      this.$router.push(key)
    }
  }
}
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

  .btn-expand {}

  .sys-menu {
    max-height: calc(100% - 65px);
    // height: 100%;
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