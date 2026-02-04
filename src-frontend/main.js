import { createApp } from "vue";
import App from "./App.vue";
import kui from "kui-vue";
import router from "./router";
import http from "./utils/http";
import store from "./store/index";
import "kui-vue/dist/k-ui.css";
import "./assets/css/index.less";

const app = createApp(App);
app.config.globalProperties.$http = http;

app.use(kui).use(store).use(router).mount("#app");
