//利用vue 的状态管理 结合 vue transition 和 css3 的 transition 实现 Jqeury toggle
//给需要的 元素加上 css  transition: height .2s ease-in-out;
//by chuchur
export function getTranstionProp(name) {
  return {
    name,
    on: {
      beforeEnter(el) {
        // el.style.overflow = 'hidden';
        el.style.height = 0
        el.style.opacity = 0.1
      },
      enter(el) {
        if (el.scrollHeight !== 0) {
          el.style.height = el.scrollHeight + 'px'  //window.getComputedStyle(el).height
          el.style.opacity = 1
        } else {
          el.style.height = ''
          el.style.opacity = ''
        }
      },
      afterEnter(el) {
        el.style.height = ''
        el.style.overflow = ''
        el.style.opacity = ''
      },
      beforeLeave(el) {
        el.style.height = el.scrollHeight + 'px'
        el.style.opacity = 1
      },
      leave(el) {
        if (el.scrollHeight !== 0) {
          el.style.height = 0;
          el.style.paddingTop = 0;
          el.style.paddingBottom = 0;
          el.style.marginTop = 0;
          el.style.marginBottom = 0;
          el.style.opacity = 0
          // el.style.overflow = 'hidden';
        }
      },
      afterLeave(el) {
        el.style.height = '';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
        el.style.marginTop = '';
        el.style.marginBottom = '';
        el.style.opacity = ''
        el.style.overflow = ''
      },
    }
  }
}

export function getTranstionHorProp(name) {
  return {
    name,
    on: {
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
          el.style.paddingLeft = 0;
          el.style.paddingRight = 0;
          el.style.marginLeft = 0;
          el.style.marginRight = 0;
          el.style.opacity = 0
          el.style.overflow = 'hidden';
        }
      },
      afterLeave(el) {
        el.style.width = '';
        el.style.paddingLeft = '';
        el.style.paddingRight = '';
        el.style.marginLeft = '';
        el.style.marginRight = '';
        el.style.opacity = ''
        el.style.overflow = ''
      },
    }
  }
}