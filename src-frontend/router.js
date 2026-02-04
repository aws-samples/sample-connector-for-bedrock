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

const modules = import.meta.glob("./pages/**/*.{vue,jsx}");
const loadView = (view_path, view_name) => {
  try {
    const extensions = [".vue", ".jsx"];

    for (const ext of extensions) {
      const componentPath = `./pages/${view_path}${ext}`;
      if (modules[componentPath]) {
        return () =>
          modules[componentPath]().then((module) => {
            if (view_name) {
              module.default.name = view_name;
            }
            return module;
          });
      }
    }

    console.error(`Component ${view_path} not found.`);
    return null;
  } catch (e) {
    console.error(`Loading ${view_path} failed:`, e);
    return null;
  }
};
const routes = [
  {
    path: "/login",
    meta: { title: "Login", icon: "" },
    component: loadView("login"),
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
        component: loadView("home", "Home"),
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
        component: loadView("sessions", "userSessions"),
        hidden: false,
      },
      {
        path: "/user/sessions/:session_id/threads",
        name: "userThreads",
        meta: { title: "menu.chat_list", icon: ChatboxEllipses },
        component: loadView("threads", "userThreads"),
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
        component: loadView("keys", "AdminKeys"),
        // hidden: localStorage.getItem('role') != 'admin'
      },
      {
        path: "/admin/kbs",
        name: "userKnowledgeBases",
        meta: { title: "menu.bedrock_kb", icon: School },
        component: loadView("kbs", "userKnowledgeBases"),
        hidden: true,
      },
      {
        path: "/admin/model",
        name: "adminModel",
        meta: { title: "menu.model", icon: ExtensionPuzzle },
        component: loadView("models", "adminModel"),
      },
      {
        path: "/admin/group",
        name: "adminGroup",
        meta: { title: "menu.group", icon: People },
        component: loadView("groups", "adminGroup"),
      },
      {
        path: "/admin/sessions",
        name: "adminSessions",
        meta: { title: "menu.topic_list", icon: Reader },
        component: loadView("sessions", "adminSessions"),
        hidden: true,
      },
      {
        path: "/admin/sessions/:session_id/threads",
        name: "adminThreads",
        meta: { title: "menu.chat_list", icon: ChatboxEllipses },
        component: loadView("threads", "adminThreads"),
        hidden: true,
      },
      {
        path: "/admin/bot",
        name: "larkBot",
        meta: { title: "menu.webhook", icon: Globe },
        component: loadView("webhook", "larkBot"),
      },
    ],
  },
];

// 不需要从后端获取的路由, 所以此外不用要处理
// store.commit("tabViews/setRoutes", routes);

const router = createRouter({
  history: createWebHistory("/manager/"),
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
