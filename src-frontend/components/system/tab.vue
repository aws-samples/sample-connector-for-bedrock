<template>
  <div class="sys-tab-box" ref="root">
    <transition-group name="tab-fade" class="tab-inner-box" tag="div" @enter="enter" @beforeEnter="beforeEnter"
      ref="tabbox" @afterEnter="afterEnter" @beforeLeave="beforeLeave" @leave="leave" @afterLeave="afterLeave">
      <div :class="cls(view)" v-for="view in views" :key="view.path">
        <Dropdown trigger="contextmenu" @click="e => handle(e, view)" :key="view.fullPath">
          <div class="sys-tab-item-inner">
            <router-link :to="{ path: view.path, query: view.query, fullPath: view.fullPath, params: view.params }">
              <span class="sys-tab-title">{{ view.meta.title }}</span>
              <Icon :type="Close" class="sys-tab-close" @click.prevent.stop="close(view)" :strokeWidth="40" />
            </router-link>
          </div>
          <Menu slot="content">
            <MenuItem key="reload">重新加载</MenuItem>
            <MenuItem key="close">关闭</MenuItem>
            <MenuItem key="close-other">关闭其他</MenuItem>
            <MenuItem key="close-left">关闭左侧</MenuItem>
            <MenuItem key="close-right">关闭右侧</MenuItem>
          </Menu>
        </Dropdown>
      </div>
    </transition-group>
  </div>
</template>
<script>
import { Close, Reload, Refresh } from 'kui-icons'
import { mapGetters } from 'vuex'
// import { getTranstionHorProp } from '../utils/transition'
export default {
  name: 'Tab',
  data() {
    return {
      Close, Reload, Refresh
    }
  },
  computed: {
    ...mapGetters(['views']),
    transProp() {
      // return getTranstionHorProp('tab-fade')
    },
    current() {
      return this.$route.path
    },
    currentIndex() {
      return this.views.findIndex(v => v.path == this.current)
    }
  },
  watch: {
    '$route'() {
      this.$store.commit('tabViews/addView', this.$route)
      this.$nextTick(() => {
        this.scrollToCenter()
      })
    }
  },
  beforeCreate() {
    this.$store.commit('tabViews/addView', this.$route)
  },
  methods: {
    scrollToCenter(animate = true) {
      // console.log(e)
      let root = this.$refs.root
      let box = this.$refs.tabbox.$el
      // console.log(root)
      let childs = (box || {}).children || []
      for (let m of childs) {
        // console.log(m)
        if (m.className.indexOf('actived') > -1) {
          // 计算 span 元素相对于 div 元素的偏移
          const offset = m.offsetLeft;
          // 计算滚动距离使 span 元素垂直居中
          const scrollDistance = offset - parseFloat((root.clientWidth / 2).toFixed(2)) + parseFloat((m.clientWidth / 2).toFixed(2));
          // 滚动到计算出的位置
          // console.log(scrollDistance, offset)
          if (animate) {
            root.scrollTo({ left: scrollDistance, behavior: 'smooth' });
          } else {
            root.scrollLeft = scrollDistance
          }
          break;
        }
      }
    },
    beforeEnter(el) {
      el.style.overflow = 'hidden';
      el.style.width = 0
      el.style.opacity = 0.1
    },
    enter(el) {
      if (el.scrollWidth !== 0) {
        el.style.width = el.scrollWidth + 'px'
        el.style.opacity = 1
      } else {
        el.style.width = ''
        el.style.opacity = ''
      }
    },
    afterEnter(el) {
      el.style.width = ''
      el.style.overflow = ''
      el.style.opacity = ''
    },
    beforeLeave(el) {
      el.style.width = el.scrollWidth + 'px'
      el.style.opacity = 1
    },
    leave(el) {
      if (el.scrollWidth !== 0) {
        el.style.width = 0;
        // el.style.paddingLeft = 0;
        // el.style.paddingRight = 0;
        // el.style.marginLeft = 0;
        // el.style.marginRight = 0;
        el.style.opacity = 0
        // el.style.margin = 0
        el.style.overflow = 'hidden';
      }
    },
    afterLeave(el) {
      el.style.width = '';
      // el.style.paddingLeft = '';
      // el.style.paddingRight = '';
      // el.style.marginLeft = '';
      // el.style.marginRight = '';
      el.style.opacity = ''
      el.style.overflow = ''
    },
    handle({ key }, view) {
      let cur_index, select_index;
      switch (key) {
        case "reload":

          this.reload(view)
          break;
        case "close":
          this.close(view)
        case "close-other":
          this.$store.commit('tabViews/closeOtherView', view)
          if (this.current != view.path) {
            this.go(view)
          }
          break;
        case "close-right":
          // return;
          cur_index = this.views.findIndex(x => x.path == this.current)
          select_index = this.views.indexOf(view)
          // console.log(cur_index, select_index, this.views)
          if (this.current != view.path && cur_index > select_index) {
            this.go(view)
          }
          this.$store.commit('tabViews/closeRightView', view)
          break;
        case "close-left":
          cur_index = this.views.findIndex(x => x.path == this.current)
          select_index = this.views.indexOf(view)
          if (this.current != view.path && cur_index < select_index) {
            this.go(view)
          }
          this.$store.commit('tabViews/closeLeftView', view)
          break;
        default:
          break
      }
    },
    reload(view) {
      this.go(view)
      this.$store.commit('tabViews/reloadView', view)
    },
    close(view) {
      let views = this.views
      if (views.length == 1) return
      if (view.path == this.current) {
        let index = views.findIndex(x => x.path == view.path)

        if (index == 0) {
          index = 1
        } else if (index == views.length - 1) {
          index = views.length - 2
        } else {
          index += 1
        }
        let item = views[index]
        this.$store.commit('tabViews/closeView', view)
        this.go(item)
      } else {
        this.$store.commit('tabViews/closeView', view)
      }
    },
    go(item) {
      this.$router.push({ path: item.path, query: item.query, fullPath: item.fullPath, params: item.params })
    },
    cls(item) {
      let index = this.views.indexOf(item)
      return ['sys-tab-item', {
        'sys-tab-item-actived': item.path == this.current,
        'sys-tab-item-first': index == 0,
        'sys-tab-item-prev': index == this.currentIndex - 1,
        'sys-tab-item-next': index == this.currentIndex + 1,
      }]
    },
  }
}
</script>
<style lang="less">
.sys-tab-box {
  display: flex;
  flex-wrap: nowrap;
  overflow: auto;
  gap: 2px;
  padding: 8px 10px 0;

  &::-webkit-scrollbar {
    height: 0;
  }

  .tab-inner-box {
    display: flex;
    flex-wrap: nowrap;
  }

  .sys-tab-item {
    display: inline-flex;
    position: relative;
    cursor: pointer;
    height: 26px;
    line-height: 26px;
    // color: #495060;
    font-size: 12px;

    &::before,
    &::after {
      content: '';
      position: absolute;
      width: 2px;
      background: var(--kui-color-main-80);
      height: 13px;
      z-index: 10;
      border-radius: 3px;
    }

    &::before {
      left: -1px;
      top: 7px;
    }

    &::after {
      right: -1px;
      top: 7px;
    }

    &:hover {
      z-index: 99;

      &::before,
      &::after {
        transition: background-color .3s;
        background-color: var(--kui-color-nav-header);
      }

      .sys-tab-item-inner {
        // transition: background-color .3s;
        background: var(--kui-color-main-80)
      }
    }

    .sys-tab-item-inner {
      border-radius: 8px;
      margin: 0 3px;
      // transition: background-color .3s ease-in;
      // background-color: #cccccc20;

      a {
        padding: 0 8px;
        color: var(--kui-color-font);
        display: flex;
        text-decoration: none;
        align-items: center;
      }
    }


    .sys-tab-title {
      max-width: 120px;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .sys-tab-close {
      margin-left: 5px;
      font-size: 15px;
      font-weight: bold;
      border-radius: 50%;
      padding: 0px;
      z-index: 10;

      &:hover {
        background-color: var(--kui-color-gray-60);
      }
    }
  }

  .sys-tab-item-first:not(.sys-tab-item-actived) {
    &::before {
      display: none;
    }
  }

  .sys-tab-item-next {
    &::before {
      display: none;
      // background-color: var(--kui-color-border);
    }
  }



  .sys-tab-item-prev {
    &::after {
      display: none;
      background-color: var(--kui-color-border);
    }
  }

  .sys-tab-item-actived {
    // background-color: #fff;
    // color: #000;
    // border-color: #42b983;
    // height: 40px;
    vertical-align: top;
    align-self: flex-start;
    justify-self: baseline;
    border-radius: 10px 10px 0 0;
    padding-bottom: 8px;
    position: relative;
    transition: none;
    z-index: 100;

    .sys-tab-item-inner {
      background: var(--kui-color-back);
      position: relative;
      border-radius: 8px 8px 0 0;
      z-index: 1;

      &::after {
        content: '';
        position: absolute;
        width: 100%;
        bottom: -8px;
        left: 0;
        height: 8px;
        background-color: var(--kui-color-back);
      }
    }

    &:hover {
      .sys-tab-item-inner {
        background: var(--kui-color-back);
      }

      &::after,
      &::before {
        transition: none;
        background-color: transparent;
        display: block;
      }
    }

    &::before,
    &::after {
      content: '';
      transition: none;
      position: absolute;
      width: 15px;
      height: 17px;
      background: none;
      bottom: 8px;
      z-index: 0;
    }

    &::before {
      box-shadow: 12px 12px 0px 9px var(--kui-color-back);
      border-radius: 0 0 12px 0;
      left: -12px;
      bottom: 2px;
      height: 16px;
      top: auto;
    }

    &::after {
      border-radius: 0 0 0 12px;
      box-shadow: -12px 12px 0px 9px var(--kui-color-back);
      right: -12px;
      top: 15px;
    }
  }


}

@keyframes fadein {
  0% {
    opacity: 0;
    width: 0;
  }

  100% {
    opacity: 1;
  }
}

@-webkit-keyframes fadein {
  0% {
    width: 0;
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}

// .tab-fade-enter-active {
//   animation: fadein 0.3s ease-in;
//   animation-fill-mode: both;
// }

.tab-fade-leave-active {
  transition: width .3s;
  animation: fadeout 0.3s ease-in-out;
  // animation-fill-mode: both;
}

@keyframes fadeout {
  0% {
    opacity: 1;
  }

  100% {
    width: 0;
    opacity: 0;
  }
}

@-webkit-keyframes fadeout {
  0% {
    opacity: 1;
  }

  100% {
    width: 0;
    opacity: 0;
  }
}
</style>