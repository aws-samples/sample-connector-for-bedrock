import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)
import getters from './getters'

import tabViews from './modules/tabViews'
import user from './modules/user'
export default new Vuex.Store({

  modules: {
    tabViews,
    user
  },
  getters,
})

