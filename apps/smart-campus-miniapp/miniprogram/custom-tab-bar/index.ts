import { getSessionSnapshot } from '../utils/session'

Component({
  data: {
    selected: 0,
    list: [{
      pagePath: "/pages/index/index",
      iconPath: "/assets/tab/home-outline.svg",
      selectedIconPath: "/assets/tab/home-solid.svg",
      text: "首页"
    }, {
      pagePath: "/pages/me/index",
      iconPath: "/assets/tab/user-outline.svg",
      selectedIconPath: "/assets/tab/user-solid.svg",
      text: "我的"
    }]
  },
  lifetimes: {
    attached() {
      this.updateSelected()
    }
  },
  pageLifetimes: {
    show() {
      this.updateSelected()
    }
  },
  methods: {
    updateSelected() {
      try {
        const pages = getCurrentPages()
        const currentPage = pages[pages.length - 1]
        if (currentPage) {
          const route = currentPage.route
          const currentPath = route.startsWith('/') ? route : '/' + route
          const selected = this.data.list.findIndex(item => item.pagePath === currentPath)
          if (selected !== -1 && this.data.selected !== selected) {
            this.setData({ selected })
          }
        }
      } catch (err) {
        // 忽略异常
      }
    },
    switchTab(e: any) {
      const data = e.currentTarget.dataset
      const url = data.path
      const index = Number(data.index)
      
      if (url === '/pages/me/index') {
        if (!getSessionSnapshot().loggedIn) {
          wx.showToast({ title: '请先登录', icon: 'none' })
          return
        }
      }
      
      if (this.data.selected !== index) {
        this.setData({ selected: index })
      }
      wx.switchTab({ url })
    }
  }
})
