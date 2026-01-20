import { getView, updateLocalRoutes } from "../utils";
import id from "hash-sum";
const state = {
  routes: [],
  views: [], //tab 依赖
  keepViews: [], //keep-alive 依赖
  keepKey: "",
};

const mutations = {
  setRoutes(state, routes) {
    state.routes = routes;
  },
  addView(state, route) {
    state.keepKey = id(route.fullPath);
    const { view, index, keepViewKey } = getView(state, route);

    if (index < 0) {
      state.views.push(view);
    } else {
      state.views.splice(index, 1, view);
    }

    if (!state.keepViews.includes(keepViewKey)) {
      state.keepViews.push(keepViewKey);
    }
    updateLocalRoutes(state);
  },
  reloadSelectView(state, route) {
    const { index } = getView(state, route);
    state.keepViews.splice(index, 1);
    route.loading = true;
    setTimeout(() => {
      route.loading = false;
    }, 300);
  },
  closeView(state, route) {
    const { index } = getView(state, route);
    state.views.splice(index, 1);
    state.keepViews.splice(index, 1);
    updateLocalRoutes(state);
  },
  closeOtherView(state, route) {
    const { view, keepViewKey } = getView(state, route);
    state.views = [view];
    state.keepViews = [keepViewKey];
    updateLocalRoutes(state);
  },
  closeRightView(state, route) {
    if (state.views.length == 1) return;
    const { index } = getView(state, route);
    state.views = state.views.slice(0, index + 1);
    state.keepViews = state.keepViews.slice(0, index + 1);
    updateLocalRoutes(state);
  },
  closeLeftView(state, route) {
    if (state.views.length == 1) return;
    const { index } = getView(state, route);
    let len = state.views.length;
    state.views = state.views.slice(index, len);
    state.keepViews = state.keepViews.slice(index, len);
    updateLocalRoutes(state);
  },
  closeAllView(state, view) {
    state.views = [];
    state.keepViews = [];
    updateLocalRoutes(state);
  },
  reloadView(state, route) {
    const { index, keepViewKey } = getView(state, route);
    state.keepViews.splice(index, 1);
    state.keepKey = Math.random();
    route.loading = true;
    setTimeout(() => {
      state.keepViews.splice(index, 0, keepViewKey);
      state.keepKey = id(route.fullPath);
      route.loading = false;
    }, 500);
  },
};

const actions = {
  // reloadView({ state, commit, dispatch }, view) {
  // return new Promise((res, rej) => {
  //   res()
  // })
  // },
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
};
