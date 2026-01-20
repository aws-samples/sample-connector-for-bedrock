import Vue from 'vue'
import App from './App.vue'
import kui from 'kui-vue'
import router from './router'
import 'kui-vue/dist/k-ui.css'
import http from './utils/http'
import store from './store/index'
import './assets/css/index.less'


import i18n from './lang/i18n'

Vue.config.productionTip = false


Vue.prototype.$http = http


Vue.use(kui, {
  i18n: (key, value) => i18n.t(key, value)
})

new Vue({
  i18n,
  router,
  store,
  render: h => h(App),
}).$mount('#app')
