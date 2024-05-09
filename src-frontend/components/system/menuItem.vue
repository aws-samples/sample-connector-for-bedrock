<template>
  <SubMenu :key="route.path" :icon="route.meta.icon" :title="route.meta.title" v-if="isSub(route) && !route.hidden">
    <MItem :key="getPath(basePath, item.path)" v-for="item in route.children" :route="item" :base-path="route.path">
    </MItem>
  </SubMenu>
  <MenuItem :key="getPath(basePath, onlyChild.path)" :icon="onlyChild.meta.icon"
    v-else-if="!route.hidden && !onlyChild.hidden ">{{ onlyChild.meta.title }}</MenuItem>
</template>
<script>
import path from 'path'

export default {
  name: 'MItem',
  props: {
    route: {
      type: Object,
      required: true
    },
    basePath: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      onlyChild: null
    }
  },
  methods: {
    isOutPath(path) {
      return /^(https?:|mailto:|tel:)/.test(path)
    },
    getPath(a, b) {
      if (this.isOutPath(b)) return b
      // return this.resolve(a, b)
      let p = path.resolve(a, b)
      return p
    },
    isSub(item) {
      let { children } = item
      if (children) {
        let childs = children.filter(x => !x.hidden)
        if (childs.length > 1) {
          return true
        } else if (childs.length == 1) {
          let child = Object.assign({ ...childs[0] })
          child.path = this.getPath(item.path, child.path)
          this.onlyChild = child
        } else {
          this.onlyChild = item
        }
      } else {
        this.onlyChild = item
        return false
      }
    },
  }
}
</script>