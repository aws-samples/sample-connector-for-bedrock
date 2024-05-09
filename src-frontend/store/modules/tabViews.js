const state = {
  views: [], //tab 依赖
  keepViews: [], //keep-alive 依赖
  keepView: true,
}

const mutations = {
  addView(state, view) {
    let index = state.views.findIndex(x => x.path == view.path)
    if (index < 0) {
      // if (!state.views.some(x => x.path == view.path)) {
      state.views.push(view)
      state.keepViews.push(view.name)
    } else {
      state.views.splice(index, 1, view)
    }
  },
  closeView(state, view) {
    let index = state.views.indexOf(view)
    state.views.splice(index, 1)
    state.keepViews.splice(index, 1)
  },
  closeOtherView(state, view) {
    state.views = [view]
    state.keepViews = [view.name]
  },
  closeRightView(state, view) {
    if (state.views.length == 1) return;
    let index = state.views.indexOf(view)
    state.views = state.views.slice(0, index + 1)
    state.keepViews = state.keepViews.slice(0, index + 1)
  },
  closeLeftView(state, view) {
    if (state.views.length == 1) return;
    let index = state.views.indexOf(view)
    let len = state.views.lenght
    state.views = state.views.slice(index, len)
    state.keepViews = state.keepViews.slice(index, len)
  },
  closeAllView(state, view) {
    state.views = []
    state.keepViews = []
  },
  reloadView(state, view) {
    let index = state.views.indexOf(view)
    state.keepViews.splice(index, 1)
    state.keepView = false
    setTimeout(() => {
      state.keepViews.splice(index, 0, view.name)
      state.keepView = true
    }, 1);
  }
}

const actions = {
  // reloadView({ state, commit, dispatch }, view) {
  // return new Promise((res, rej) => {
  //   res()
  // })
  // },

}


export default {
  namespaced: true,
  state,
  mutations,
  actions
}