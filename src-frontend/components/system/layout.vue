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
              <Dropdown show-placement-arrow @click="change_lang">
                <Button :icon="Language" size="small" />
                <template #overlay>
                  <Menu>
                    <MenuItem key="en">🇺🇸 English</MenuItem>
                    <MenuItem key="zh">🇨🇳 简体中文</MenuItem>
                  </Menu>
                </template>
              </Dropdown>
              <Button
                :icon="theme != 'dark' ? Moon : Sunny"
                size="small"
                @click="switchMode"
              />
              <!-- <Input :icon="Search"  shape="circle" placeholder="搜索" style="width:200px" /> -->
              <Dropdown
                show-placement-arrow
                trigger="hover"
                placement="bottom-right"
                @click="sign_out"
              >
                <Button :icon="Person" size="small">{{ name }} </Button>
                <Menu slot="content">
                  <MenuItem key="sign_out">Sign out </MenuItem>
                </Menu>
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
import { ref, onMounted, onUnmounted, getCurrentInstance, computed } from "vue";
import { Sunny, Moon, Person, Language } from "kui-icons";
import Sider from "./sider.vue";
import Tab from "./tab.vue";
import AppMain from "./AppMain.vue";
const { proxy } = getCurrentInstance();
const routes = computed(() => proxy.$store.state.tabViews.routes);
console.log(routes);
const monitor = window.matchMedia("(prefers-color-scheme: dark)");

const theme = ref(localStorage.getItem("theme"));
const name = ref(localStorage.getItem("name") || "");

const switchMode = (event) => {
  proxy.$theme.setThemeMode(event, (isDark) => {
    proxy.$store.commit("theme/setTheme", isDark ? "dark" : "light");
  });
};

const matchMode = (e) => {
  const body = document.documentElement;
  if (e.matches) {
    if (!body.hasAttribute("theme-mode")) {
      body.setAttribute("theme-mode", "dark");
      proxy.$store.commit("theme/setTheme", "dark");
    }
  } else {
    if (body.hasAttribute("theme-mode")) {
      body.removeAttribute("theme-mode");
      proxy.$store.commit("theme/setTheme", "light");
    }
  }
};

onMounted(() => {
  matchMode({ matches: theme == "dark" });

  monitor.addEventListener("change", matchMode);

  if (theme.value) {
    document.documentElement.setAttribute("theme-mode", theme.value);
  }
  let key = localStorage.getItem("key");
  if (!key) {
    proxy.$router.push("/login");
  }
});

onUnmounted(() => {
  monitor.removeEventListener("change", matchMode);
});

const change_lang = ({ key }) => {
  // this.$i18n.locale = key;
  localStorage.setItem("lang", key);
  location.reload();
};

const sign_out = () => {
  localStorage.setItem("key", "");
  localStorage.setItem("role", "");
  proxy.$store.commit("user/logout");
  router.push("/login");
};
</script>

<style scoped lang="less">
.k-sys-layout {
  height: 100%;

  .layout-back {
    height: 100%;
  }

  .container {
    padding: 0;
    height: calc(100% - 47px);
    overflow: auto;
  }

  .header-nav {
    // border-bottom: 1px solid var(--kui-color-border);
    padding: 0px 10px 4px 0px;
    background-color: var(--kui-color-nav-header);
    position: relative;

    &::after {
      content: "";
      position: absolute;
      height: 6px;
      background-color: var(--kui-color-back);
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
  overflow: auto;
}

.k-sys-layout .k-layout-footer {
  text-align: center;
  color: #999;
}
</style>
