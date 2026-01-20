const state = {
  theme: localStorage.getItem('theme-mode') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
}

const mutations = {
  setTheme(state, theme) {
    state.theme = theme
    localStorage.setItem('theme-mode', theme)
  }
}


export default {
  namespaced: true,
  state,
  mutations,
  // actions,
};