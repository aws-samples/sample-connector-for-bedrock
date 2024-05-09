const state = {
  user: {},
}

// store.commit
const mutations = {
  login: (state, user) => {
    console.log('mutations: login:', user)
    state.user.key = user.key
    state.user.name = user.name
    state.user.role = user.role
    state.user.host = user.host
  },
  logout: (state, args) => {
    console.log('mutations: logout')
    state.user.key = ''
    state.user.name = ''
    state.user.role = ''
  }

}

// store.dispatch
const actions = {

}


export default {
  namespaced: true,
  state,
  mutations,
  actions
}