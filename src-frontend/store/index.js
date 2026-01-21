import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);
import getters from "./getters";

import tabViews from "./modules/tabViews";
import theme from "./modules/theme";
import user from "./modules/user";
export default new Vuex.Store({
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
