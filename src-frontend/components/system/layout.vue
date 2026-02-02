<template>
  <div class="k-sys-layout">
    <Layout class="layout-back">
      <Sider :routes="routes" />
      <Content class="k-sys-main">
        <Row type="flex" align="middle" class="header-nav">
          <Col flex="1" style="width: 0">
            <Tab />
          </Col>
          <Col>
            <Space :size="10">
              <Tooltip title="go to github">
                <Button :icon="LogoGithub" @click="openSource" size="small"> </Button>
              </Tooltip>
              <Dropdown show-placement-arrow>
                <Button :icon="Language" size="small" />
                <template #overlay>
                  <Menu @select="({ key }) => changeLang(key)">
                    <MenuItem key="en">🇺🇸 English</MenuItem>
                    <MenuItem key="zh">🇨🇳 简体中文</MenuItem>
                  </Menu>
                </template>
              </Dropdown>
              <Button :icon="themeMode != 'dark' ? Moon : Sunny" size="small" @click="switchMode" />
              <Dropdown show-placement-arrow trigger="hover" placement="bottom-right">
                <Button :icon="Person" size="small">{{ name }} </Button>
                <template #overlay>
                  <Menu @select="sign_out">
                    <MenuItem key="sign_out">Sign out </MenuItem>
                  </Menu>
                </template>
              </Dropdown>
            </Space>
          </Col>
        </Row>
        <div class="container">
          <AppMain />
        </div>
      </Content>
    </Layout>
  </div>
</template>
<script setup>
import { ref, onMounted, onUnmounted, computed, inject } from "vue";
import { Sunny, Moon, Person, Language, LogoGithub } from "kui-icons";
import Sider from "./sider.vue";
import Tab from "./tab.vue";
import AppMain from "./AppMain.vue";
import { useRouter } from "vue-router";
import { useStore } from "vuex";
import { theme } from "kui-vue";
const router = useRouter();
const store = useStore();

const routes = computed(() => {
  const routes = router.options.routes.filter((item) => !item.hidden);
  let menus = [];
  routes.forEach((route) => {
    if (!route.children || route.children.length == 0) {
      menus.push(route);
    } else {
      const children = route.children.filter((item) => !item.hidden);
      if (children.length == 1) {
        menus.push(route.children[0]);
      } else {
        menus.push(route);
      }
    }
  });
  return menus;
});
const openSource = () => {
  window.open("https://github.com/aws-samples/sample-connector-for-bedrock");
};

const monitor = window.matchMedia("(prefers-color-scheme: dark)");

const themeMode = ref(localStorage.getItem("theme-mode"));
const name = ref(localStorage.getItem("name") || "");

const switchMode = (event) => {
  theme.setThemeMode(event, (isDark) => {
    themeMode.value = isDark ? "dark" : "light";
    store.commit("theme/setTheme", isDark ? "dark" : "light");
  });
};

const matchMode = (e) => {
  const body = document.documentElement;
  if (e.matches) {
    if (!body.hasAttribute("theme-mode")) {
      body.setAttribute("theme-mode", "dark");
      store.commit("theme/setTheme", "dark");
    }
  } else {
    if (body.hasAttribute("theme-mode")) {
      body.removeAttribute("theme-mode");
      store.commit("theme/setTheme", "light");
    }
  }
};

onMounted(() => {
  matchMode({ matches: themeMode.value == "dark" });

  monitor.addEventListener("change", matchMode);

  if (themeMode.value) {
    document.documentElement.setAttribute("theme-mode", themeMode.value);
  }
  // let key = localStorage.getItem("key");
  // if (!key) {
  //   router.push("/login");
  // }
});

onUnmounted(() => {
  monitor.removeEventListener("change", matchMode);
});
const changeLang = inject("changeLang");

const sign_out = () => {
  localStorage.setItem("key", "");
  localStorage.setItem("role", "");
  store.commit("user/logout");
  router.push("/login");
};
</script>

<style lang="less">
.k-sys-layout {
  height: 100%;
  width: 100%;

  .layout-back {
    height: 100%;
  }

  .container {
    height: calc(100% - 47px);
    flex: 1;
    overflow: auto;
    // background-color: var(--kui-color-bg-layout);
  }

  .header-nav {
    padding: 0px 10px 4px 0px;
    background-color: var(--kui-color-bg-layout);
    position: relative;

    &::after {
      content: "";
      position: absolute;
      height: 6px;
      background-color: var(--kui-color-bg);
      bottom: 0;
      left: 0;
      right: 0;
    }
  }
}

.k-sys-layout .k-sys-main .nav {
  padding: 16px 0 0 16px;
}

.k-sys-layout .if-top-menu {
  line-height: 61px;
}

.k-sys-layout .k-sys-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.k-sys-layout .k-layout-footer {
  text-align: center;
  color: #999;
}
</style>
