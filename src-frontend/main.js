import Vue from "vue";
import App from "./App.vue";
import kui from "kui-vue";
import router from "./router";
import "kui-vue/dist/k-ui.css";
import http from "./utils/http";
import store from "./store/index";
import "./assets/css/index.less";

Vue.config.productionTip = false;

Vue.prototype.$http = http;

Vue.use(kui);

new Vue({
  router,
  store,
  render: (h) => h(App),
}).$mount("#app");
