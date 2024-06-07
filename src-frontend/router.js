import Vue from "vue"
import VueRouter from "vue-router"
Vue.use(VueRouter)
import Layout from './components/system/layout'
import i18n from "./lang/i18n"
const originalPush = VueRouter.prototype.push
VueRouter.prototype.push = function push(location, onResolve, onReject) {
  if (onResolve || onReject) return originalPush.call(this, location, onResolve, onReject)
  return originalPush.call(this, location).catch(err => err)
}
import { Home, Tv, Globe, StatsChart, Timer, Person, DocumentText, Hammer, Link, Key, Menu, Reader } from 'kui-icons'

const router = new VueRouter({
  mode: 'hash',
  routes: [
    {
      path: '/login',
      meta: { title: 'Login', icon: '' },
      component: () => import(/*webpackChunkName:'login'*/'./pages/login'),
      hidden: true
    },
    {
      path: '/',
      component: Layout,
      meta: { title: 'Home', icon: '' },
      children: [
        {
          path: '/',
          name: 'Home',
          meta: { title: i18n.t("menu.dashboard"), icon: Home },
          component: () => import(/*webpackChunkName:'Home'*/'./pages/home')
        }
      ]
    },
    {
      path: '/user',
      component: Layout,
      meta: { title: '我的', icon: Person },
      children: [
        {
          path: '/user/sessions',
          name: 'userSessions',
          meta: { title: i18n.t("menu.session"), icon: Menu },
          component: () => import(/*webpackChunkName:'Home'*/'./pages/sessions'),
          hidden: false
        },
        {
          path: '/user/sessions/:session_id/threads',
          name: 'userThreads',
          meta: { title: i18n.t("menu.thread"), icon: Reader },
          component: () => import(/*webpackChunkName:'Home'*/'./pages/threads'),
          hidden: true
        }
      ]
    },
    {
      path: '/admin',
      component: Layout,
      meta: { title: 'Admin', icon: Hammer },
      hidden: localStorage.getItem('role') != 'admin',
      children: [
        {
          path: '/admin/keys',
          name: 'AdminKeys',
          meta: { title: i18n.t("menu.key") },
          component: () => import(/*webpackChunkName:'Home'*/'./pages/keys'),
          // hidden: localStorage.getItem('role') != 'admin'
        },
        {
          path: '/admin/kbs',
          name: 'userKnowledgeBases',
          meta: { title: i18n.t("menu.bedrock_kb") },
          component: () => import(/*webpackChunkName:'Home'*/'./pages/kbs'),
          hidden: true
        },
        {
          path: '/admin/model',
          name: 'adminModel111',
          meta: { title: i18n.t("menu.model") },
          component: () => import(/*webpackChunkName:'Home'*/'./pages/models')
        },
        {
          path: '/admin/group',
          name: 'adminGroup',
          meta: { title: i18n.t("menu.group") },
          component: () => import(/*webpackChunkName:'Home'*/'./pages/groups')
        },
        {
          path: '/admin/sessions',
          name: 'adminSessions',
          meta: { title: i18n.t("menu.session") },
          component: () => import(/*webpackChunkName:'Home'*/'./pages/sessions'),
          hidden: true,
        },
        {
          path: '/admin/sessions/:session_id/threads',
          name: 'adminThreads',
          meta: { title: i18n.t("menu.thread") },
          component: () => import(/*webpackChunkName:'Home'*/'./pages/threads'),
          hidden: true
        }
      ]
    },
  ]
})


export default router