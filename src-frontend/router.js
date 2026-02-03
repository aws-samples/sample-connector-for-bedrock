import { createRouter, createWebHistory } from "vue-router";
import { loading } from "kui-vue";

import Layout from "./components/system/layout";

import {
  Home,
  ChatboxEllipses,
  School,
  Person,
  Hammer,
  Key,
  Menu as MenuIcon,
  Reader,
  People,
  ExtensionPuzzle,
  Globe,
} from "kui-icons";
const routes = [
  {
    path: "/login",
    meta: { title: "Login", icon: "" },
    component: () => import("./pages/login"),
    hidden: true,
  },
  {
    path: "/",
    component: Layout,
    meta: { title: "Home", icon: "" },
    children: [
      {
        path: "/",
        name: "Home",
        meta: { title: "menu.dashboard", icon: Home },
        component: () => import("./pages/home"),
      },
    ],
  },
  {
    path: "/user",
    component: Layout,
    meta: { title: "我的", icon: Person },
    children: [
      {
        path: "/user/sessions",
        name: "userSessions",
        meta: { title: "menu.topic_list", icon: MenuIcon },
        component: () => import("./pages/sessions"),
        hidden: false,
      },
      {
        path: "/user/sessions/:session_id/threads",
        name: "userThreads",
        meta: { title: "menu.chat_list", icon: ChatboxEllipses },
        component: () => import("./pages/threads"),
        hidden: true,
      },
    ],
  },
  {
    path: "/admin",
    component: Layout,
    meta: { title: "menu.admin", icon: Hammer },
    hidden: localStorage.getItem("role") != "admin",
    children: [
      {
        path: "/admin/keys",
        name: "AdminKeys",
        meta: { title: "menu.key", icon: Key },
        component: () => import("./pages/keys"),
        // hidden: localStorage.getItem('role') != 'admin'
      },
      {
        path: "/admin/kbs",
        name: "userKnowledgeBases",
        meta: { title: "menu.bedrock_kb", icon: School },
        component: () => import("./pages/kbs"),
        hidden: true,
      },
      {
        path: "/admin/model",
        name: "adminModel",
        meta: { title: "menu.model", icon: ExtensionPuzzle },
        component: () => import("./pages/models"),
      },
      {
        path: "/admin/group",
        name: "adminGroup",
        meta: { title: "menu.group", icon: People },
        component: () => import("./pages/groups"),
      },
      {
        path: "/admin/sessions",
        name: "adminSessions",
        meta: { title: "menu.topic_list", icon: Reader },
        component: () => import("./pages/sessions"),
        hidden: true,
      },
      {
        path: "/admin/sessions/:session_id/threads",
        name: "adminThreads",
        meta: { title: "menu.chat_list", icon: ChatboxEllipses },
        component: () => import("./pages/threads"),
        hidden: true,
      },
      {
        path: "/admin/bot",
        name: "larkBot",
        meta: { title: "menu.webhook", icon: Globe },
        component: () => import("./pages/webhook.vue"),
      },
    ],
  },
];

// 不需要从后端获取的路由, 所以此外不用要处理
// store.commit("tabViews/setRoutes", routes);

const router = createRouter({
  history: createWebHistory('/manager/'),
  routes,
});

router.beforeEach((to, from, next) => {
  loading.start();
  const whiteList = ["/login"];
  let key = localStorage.getItem("key");
  if (!key && !whiteList.includes(to.path)) {
    next("/login");
  } else {
    next();
  }
});

router.afterEach((route) => {
  loading.finish();
});
export default router;
