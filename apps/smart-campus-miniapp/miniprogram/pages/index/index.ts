// pages/index/index.ts
import * as storage from '../../utils/storage'
import * as pageHelper from '../../utils/page-helper'
import * as logger from '../../utils/logger'
import * as constants from '../../utils/constants'
import { throttle } from '../../utils/throttle'
import request from '../../utils/request'
import { calculateFeatureVisibility, getBaseFeatureVisibilityFlags } from '../../utils/feature-visibility'
import { clearLoginSession, getSessionSnapshot } from '../../utils/session'

const initialSession = getSessionSnapshot()

Page({
  data: {
    motto: '欢迎使用小程序',
    loggedIn: initialSession.loggedIn,
    avatarUrl: initialSession.avatarUrl,
    nickName: initialSession.nickName,
    isSuperAdmin: initialSession.isSuperAdmin,
    canViewResources: true,
    canViewBMI: true,
    canViewTodo: true,
    canViewCT8: true,

    canViewSmartControl: true,
    canViewHeatPump: true,
    canViewDailyNews: true,

    _firstLoad: false, // 彻底废弃，避免第一帧文字和按钮高度塌陷
    notificationBadge: false,
    showNoticeModal: false,
    noticeTitle: '',
    noticeContent: '',
    noticeTime: '',
    canViewCourseOrder: true,
    isReady: true,
    enableInnerScroll: false,
  },
  _scrollMeasureTimer: null as number | null,
  _featureVisibility: null as any,
  _userRole: 'user',
  _permissions: [] as string[],

  onLoad() {
    logger.debug('Index page onLoad', undefined, 'IndexPage')
    try {
      this.loadUserInfo(true)
      // 并发执行角色刷新和通知获取，不阻塞首屏渲染
      Promise.all([
        this.refreshRoleForce(),
        this.loadLatestNotification(),
        this.refreshFeatureVisibility()
      ]).catch(err => {
        logger.error('Index tasks error', err, 'IndexPage')
      })
    } catch (err) {
      logger.error('Index onLoad error', err, 'IndexPage')
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    if (!this.data._firstLoad) {
      this.loadUserInfo(false)
      // 并行执行，避免串行阻塞
      Promise.all([
        this.refreshRole(),
        this.loadLatestNotification(),
        this.refreshFeatureVisibility()
      ]).catch(() => {})
    }
    this._updateInnerScrollState()
  },

  onReady() {
    this._updateInnerScrollState()
  },

  onUnload() {
    if (this._scrollMeasureTimer) {
      clearTimeout(this._scrollMeasureTimer)
      this._scrollMeasureTimer = null
    }
  },

  loadUserInfo(isFirstLoad: boolean = false) {
    const session = getSessionSnapshot()
    const { loggedIn, avatarUrl, nickName, isSuperAdmin } = session

    // 仅当数据变化时才更新，减少 setData 调用
    const updates: any = {}
    if (loggedIn !== this.data.loggedIn) updates.loggedIn = loggedIn
    if (avatarUrl !== this.data.avatarUrl) updates.avatarUrl = avatarUrl
    if (nickName !== this.data.nickName) updates.nickName = nickName
    if (isSuperAdmin !== this.data.isSuperAdmin) updates.isSuperAdmin = isSuperAdmin
    if (isFirstLoad) updates._firstLoad = false

    if (Object.keys(updates).length > 0) {
      this.setData(updates)
    }
    
    this.updateDynamicCache()
    this._updateInnerScrollState()
  },

  async refreshRole() {
    await pageHelper.refreshUserRole(this)
    this.updatePermissionFlags()
  },

  async refreshRoleForce() {
    await pageHelper.refreshUserRole(this, true)
    this.updatePermissionFlags()
  },

  updatePermissionFlags() {
    const isSuperAdmin = this.data.isSuperAdmin
    const permissions = storage.getPermissions() || []
    
    // 获取用户登录状态和原始角色
    const loggedIn = this.data.loggedIn
    const userRole = loggedIn ? (storage.getUserRole() || (isSuperAdmin ? 'super_admin' : 'user')) : 'guest'

    // 尝试从缓存加载上一次的显隐配置，避免闪现
    this._featureVisibility = wx.getStorageSync('featureVisibilityCache') || null

    this._userRole = userRole
    this._permissions = permissions

    // 将显隐配置在此处一并计算合并，避免 setData 造成的界面闪退再闪出
    const initialData = getBaseFeatureVisibilityFlags({ loggedIn, isSuperAdmin })
    const visibilityData = calculateFeatureVisibility({
      config: this._featureVisibility,
      userRole,
      permissions,
      isSuperAdmin,
    })
    
    this.setData({ ...initialData, ...visibilityData }, () => this._updateInnerScrollState())
    this.updateDynamicCache()
  },

  async refreshFeatureVisibility() {
    try {
      const res = await request<any>('/mp/config/feature_visibility', 'GET', { _: Date.now() })
      if (res && res.success && res.result) {
        this._featureVisibility = res.result
        wx.setStorageSync('featureVisibilityCache', res.result)
        this.applyFeatureVisibility()
      }
    } catch (err) {
      logger.error('Refresh feature visibility error', err, 'IndexPage')
    }
  },

  applyFeatureVisibility() {
    const data = calculateFeatureVisibility({
      config: this._featureVisibility,
      userRole: this._userRole,
      permissions: this._permissions,
      isSuperAdmin: this.data.isSuperAdmin,
    })
    if (Object.keys(data).length > 0) {
      this.setData(data, () => this._updateInnerScrollState())
      this.updateDynamicCache()
    }
  },

  _toPx(value: any): number {
    const n = parseFloat(String(value || '0'))
    return Number.isFinite(n) ? n : 0
  },

  _updateInnerScrollState() {
    if (this._scrollMeasureTimer) {
      clearTimeout(this._scrollMeasureTimer)
      this._scrollMeasureTimer = null
    }

    this._scrollMeasureTimer = setTimeout(() => {
      let homeRect: any = null
      let contentRect: any = null
      const query = wx.createSelectorQuery()
      query.select('.home').fields({ size: true, computedStyle: ['paddingTop', 'paddingBottom'] }, (res: any) => {
        homeRect = res
      })
      query.select('.content-wrapper').boundingClientRect((res: any) => {
        contentRect = res
      })
      query.exec(() => {
        if (!homeRect || !contentRect) return

        const homeHeight = Number(homeRect.height) || 0
        const paddingTop = this._toPx(homeRect.paddingTop)
        const paddingBottom = this._toPx(homeRect.paddingBottom)
        const contentHeight = Number(contentRect.height) || 0
        const viewportContentHeight = Math.max(homeHeight - paddingTop - paddingBottom, 0)
        const scrollable = contentHeight > viewportContentHeight + 2

        if (scrollable !== this.data.enableInnerScroll) {
          this.setData({ enableInnerScroll: scrollable })
        }
      })
    }, 16) as unknown as number
  },

  updateDynamicCache() {
    if (typeof (this as any).setInitialRenderingCache === 'function') {
      try {
        const dynamicData = { ...this.data }
        // 避免缓存弹窗和一次性通知标识，保持干净的基础数据
        dynamicData.showNoticeModal = false
        dynamicData.notificationBadge = false
        dynamicData._firstLoad = false
        ;(this as any).setInitialRenderingCache({ dynamicData })
      } catch (err) {
        // ignore
      }
    }
  },

  _throttledNavigate: throttle((url: string) => {
    wx.navigateTo({ url })
  }, 500),

  _throttledReLaunch: throttle((url: string) => {
    wx.reLaunch({ url })
  }, 500),

  guardAndGo(_feature: string, url: string) {
    this._throttledNavigate(url)
  },

  onGoLogin() {
    this._throttledNavigate(constants.ROUTES.LOGIN)
  },

  onGoResources() {
    this.guardAndGo('resources', constants.ROUTES.RESOURCES)
  },

  onGoBMI() {
    this.guardAndGo('bmi', constants.ROUTES.BMI)
  },





  onGoTodo() {
    this.guardAndGo('todo', constants.ROUTES.TODO)
  },

  onGoCT8Management() {
    this.guardAndGo('ct8management', constants.ROUTES.CT8_MANAGEMENT)
  },



  onGoSmartControl() {
    this.guardAndGo('smart_control', constants.ROUTES.SMART_CONTROL)
  },

  onGoHeatPump() {
    this.guardAndGo('heat_pump', constants.ROUTES.HEAT_PUMP)
  },

  onGoDailyNews() {
    this._throttledNavigate('/pages/daily-news/index')
  },



  onGoCourseOrder() {
    if (!storage.getLoginStatus()) {
      wx.showToast({
        title: constants.MESSAGES.LOGIN_REQUIRED,
        icon: 'none'
      })
      return
    }
    this._throttledNavigate(constants.ROUTES.COURSE_QUERY)
  },




  async onScan() {
    if (!this.data.loggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    // 跳转到自定义的扫码页面
    wx.navigateTo({
      url: '/pages/scan/index',
      fail: (err) => logger.error('Navigate to custom scan page failed', err, 'IndexPage')
    });
  },

  onGoHome() {
    wx.switchTab({ url: constants.ROUTES.INDEX })
  },

  onGoMe() {
    if (storage.getLoginStatus()) {
      wx.switchTab({ url: constants.ROUTES.ME })
    } else {
      wx.showToast({
        title: constants.MESSAGES.LOGIN_REQUIRED,
        icon: 'none',
        duration: 1500,
      })
    }
  },

  onLogout() {
    this.setData(clearLoginSession())
  },

  onShowNotification() {
    const cache = wx.getStorageSync('latestNotification')
    const content = cache && cache.content ? String(cache.content) : '暂无新通知'
    const title = cache && cache.title ? String(cache.title) : '系统通知'
    const pubTs: any = cache && (cache as any).publishedAt
    const pubText = pubTs ? pageHelper.formatTimestamp(Number(pubTs) * 1000) : ''
    this.setData({
      showNoticeModal: true,
      noticeTitle: title,
      noticeContent: content,
      noticeTime: pubText
    })
  },
  onCloseNoticeModal() {
    try {
      const latest: any = wx.getStorageSync('latestNotification') || null
      if (latest && latest.id !== undefined) {
        const key = `${latest.id || ''}-${latest.updatedAt || latest.publishedAt || ''}`
        wx.setStorageSync('latestNotification_read_key', key)
        try { wx.removeStorageSync('latestNotification_read_id') } catch (e) { }
      }
    } catch (e) { }
    this.setData({ showNoticeModal: false, notificationBadge: false })
  },
  async loadLatestNotification() {
    const now = Date.now()
    try {
      const lastTs: any = wx.getStorageSync('latestNotification_ts') || 0
      if (now - Number(lastTs || 0) < 60000) {
        // 缓存有效，检查红点
        const latest: any = wx.getStorageSync('latestNotification') || null
        if (latest) {
          const readKey: any = wx.getStorageSync('latestNotification_read_key')
          const currKey = `${latest.id || ''}-${latest.updatedAt || latest.publishedAt || ''}`
          this.setData({ notificationBadge: String(readKey || '') !== String(currKey) })
        }
        return
      }
    } catch (e) { }

    try {
      const data = await request<any>('/notifications/active', 'GET', { _: now })
      if (data && data.success) {
        const arr = data.items || []
        const n = arr[0]
        logger.debug('Fetched notifications', arr, 'IndexPage')
        if (n) {
          try {
            wx.setStorageSync('latestNotification', { id: n.id, title: n.title, content: n.content, updatedAt: n.updatedAt, publishedAt: n.publishedAt })
            wx.setStorageSync('latestNotification_ts', Date.now())

            const readKey: any = wx.getStorageSync('latestNotification_read_key')
            const currKey = `${n.id || ''}-${n.updatedAt || n.publishedAt || ''}`
            this.setData({ notificationBadge: String(readKey || '') !== String(currKey) })
          } catch (e) { }
        }
      } else {
        logger.error('Fetch notifications failed', data, 'IndexPage')
      }
    } catch (err) {
      logger.error('Fetch notifications network error', err, 'IndexPage')
    }
  },
})
