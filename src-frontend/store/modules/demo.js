const state = {
  any: [],
}

// store.commit
const mutations = {
  any_funA: (state, args) => {
    // 
  }

}

// store.dispatch
const actions = {

  any_funB({ dispatch, state, commit }, args) {
    dispatch('any_funC')
    commit('any_funA')
  },
  any_funC() {
    //
  }

}


export default {
  namespaced: true,
  state,
  mutations,
  actions
}