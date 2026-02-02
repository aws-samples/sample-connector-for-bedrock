import { createStore } from "vuex";

import getters from "./getters";

import tabViews from "./modules/tabViews";
import theme from "./modules/theme";
import user from "./modules/user";
const store = createStore({
  state: {
    loading: false,
    keepKey: 0,
  },
  modules: {
    tabViews,
    user,
    theme,
  },
  getters,
});

store.state.tabViews.views = JSON.parse(localStorage.getItem("routes") || "[]");
export default store;
