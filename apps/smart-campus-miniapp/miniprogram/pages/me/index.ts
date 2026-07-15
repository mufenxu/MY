// pages/me/index.ts
import * as pageHelper from '../../utils/page-helper'
import * as storage from '../../utils/storage'
import * as constants from '../../utils/constants'
import * as logger from '../../utils/logger'
import { throttle } from '../../utils/throttle'
import { isLocalFilePath } from '../../utils/auth'
import request from '../../utils/request'
import { clearLoginSession, getSessionSnapshot } from '../../utils/session'

interface UserProfile {
  _id?: string
  userId?: string
  userid?: string
  id?: string
  nickName?: string
  avatarUrl?: string
  role?: string
  roleLabel?: string
  status?: string
  statusLabel?: string
  lastLoginAt?: number
  lastLoginAtText?: string
  userIdShort?: string
}

Page({
  _isAlive: false,
  _logoutTimer: null as number | null,
  _scrollMeasureTimer: null as number | null,
  data: {
    contentTop: 80,
    showLogout: false,
    userProfile: null as UserProfile | null,
    isAdmin: false,
    isSuperAdmin: false,
    lastLoadedAt: 0,
    isLoading: true,
    pageReady: false,
    enableInnerScroll: false,
  },

  onLoad() {
    this._isAlive = true
    logger.debug('Me page onLoad', undefined, 'MePage')
    try {
      const menuButton = pageHelper.getMenuButtonBoundingClientRect()

      // 合并所有初始化数据为一次 setData，避免多次渲染
      const updateData: any = { pageReady: true, isLoading: false }
      if (menuButton && menuButton.bottom) {
        updateData.contentTop = menuButton.bottom
      }

      // 先触发数据合并
      const profile = storage.getUserProfile()
      if (profile) {
        updateData.userProfile = profile
        updateData.isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
        updateData.isSuperAdmin = profile.role === 'super_admin'
      }

      const session = getSessionSnapshot()
      updateData.showLogout = session.loggedIn

      this.setData(updateData)

      // 异步刷新，纯静默
      if (session.loggedIn) {
        this.loadSelf()
      }
      this._updateInnerScrollState()
    } catch (err) {
      logger.error('Me page onLoad error', err, 'MePage')
      this.setData({ pageReady: true, isLoading: false })
    }
  },

  onShow() {
    this._isAlive = true
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    
    // 移除强制刷新 (forceRefresh: true)，由 refreshUserRole 内部的 CACHE_DURATION (2min) 控制
    // 这样在频繁切换页面时不会有网络阻塞延迟，界面响应更直接
    pageHelper.refreshUserRole(this, false) 
    
    if (Date.now() - (this.data.lastLoadedAt || 0) >= 5 * constants.TIME.MINUTE) {
      this.loadSelf()
    }
    this._updateInnerScrollState()
  },

  onReady() {
    this._updateInnerScrollState()
  },

  loadCachedProfile() {
    const profile = storage.getUserProfile()
    if (profile) {
      const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
      const isSuperAdmin = profile.role === 'super_admin'
      this.setData({
        userProfile: profile,
        isAdmin,
        isSuperAdmin,
      })
    }
  },

  async refreshRole() {
    const session = getSessionSnapshot()
    this.setData({ showLogout: session.loggedIn })
  },

  async loadSelf() {
    if (!getSessionSnapshot().loggedIn) {
      if (this._isAlive) {
        this.setData({
          showLogout: false,
          userProfile: null,
          isAdmin: false,
          isSuperAdmin: false,
        }, () => this._updateInnerScrollState())
      }
      return
    }

    try {
      const res = await request('/users/me')
      if (!this._isAlive) return

      if (res && res.success && res.user) {
        const user = res.user
        const userId = user._id || user.userId || user.userid || user.id || ''

        // 头像始终使用本地 storage（因为头像是本地临时路径，不上传服务器）
        const localAvatarUrl = storage.getAvatarUrl()
        const localNickName = storage.getNickName()

        // 服务器返回的 avatarUrl 如果是本地路径则忽略
        const serverAvatarUrl = (user.avatarUrl && user.avatarUrl.trim() && !isLocalFilePath(user.avatarUrl))
          ? user.avatarUrl : ''

        const profile: UserProfile = {
          ...user,
          // 头像优先使用本地存储，服务器的本地路径无效
          avatarUrl: localAvatarUrl || serverAvatarUrl,
          nickName: (user.nickName && user.nickName.trim()) ? user.nickName : localNickName,
          roleLabel: constants.ROLE_LABELS[user.role] || user.role || '用户',
          statusLabel: constants.STATUS_LABELS[user.status] || user.status || '正常',
          userIdShort: pageHelper.formatUserId(userId),
          lastLoginAtText: pageHelper.formatTimestamp(user.lastLoginAt),
        }

        const isAdmin = user.role === 'admin' || user.role === 'super_admin'
        const isSuperAdmin = user.role === 'super_admin'

        this.setData({
          userProfile: profile,
          isAdmin,
          isSuperAdmin,
          lastLoadedAt: Date.now(),
        }, () => this._updateInnerScrollState())

        storage.setUserProfile(profile)

        // 昵称从服务器同步到本地（头像不同步，因为是本地路径）
        if (profile.nickName && profile.nickName.trim()) {
          storage.setNickName(profile.nickName)
        }
      }
    } catch (err) {
      logger.error('加载用户信息失败', err, 'MePage')
    }
  },

  _throttledNavigate: throttle((url: string) => {
    wx.navigateTo({ url })
  }, 500),

  _throttledReLaunch: throttle((url: string) => {
    wx.reLaunch({ url })
  }, 500),

  onCopyId() {
    const userProfile = this.data.userProfile
    if (userProfile) {
      const userId = userProfile.userId || userProfile._id || ''
      if (userId) {
        wx.setClipboardData({
          data: String(userId),
          success: () => {
            logger.showSuccess('已复制ID')
          },
        })
      }
    }
  },
  onLogout() {
    this.setData(clearLoginSession())
    logger.showSuccess('已退出')
    if (this._logoutTimer) {
      clearTimeout(this._logoutTimer)
    }
    this._logoutTimer = setTimeout(() => {
      this._logoutTimer = null
      wx.switchTab({ url: constants.ROUTES.INDEX })
    }, 300)
  },

  onGoHome() {
    wx.switchTab({ url: constants.ROUTES.INDEX })
  },

  onGoMe() {
    // Already on Me page
  },

  onHide() {
    this._isAlive = false
  },

  onUnload() {
    this._isAlive = false
    if (this._logoutTimer) {
      clearTimeout(this._logoutTimer)
      this._logoutTimer = null
    }
    if (this._scrollMeasureTimer) {
      clearTimeout(this._scrollMeasureTimer)
      this._scrollMeasureTimer = null
    }
  },

  onOpenPrivacy() {
    try {
      const openPrivacy = (wx as any).openPrivacyContract
      if (typeof openPrivacy === 'function') {
        openPrivacy({})
      }
    } catch (err) {
      // ignore
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
      let containerRect: any = null
      let contentRect: any = null
      const query = wx.createSelectorQuery()
      query.select('.me').fields({ size: true, computedStyle: ['paddingTop', 'paddingBottom'] }, (res: any) => {
        containerRect = res
      })
      query.select('.content-wrapper').boundingClientRect((res: any) => {
        contentRect = res
      })
      query.exec(() => {
        if (!containerRect || !contentRect) return

        const containerHeight = Number(containerRect.height) || 0
        const paddingTop = this._toPx(containerRect.paddingTop)
        const paddingBottom = this._toPx(containerRect.paddingBottom)
        const contentHeight = Number(contentRect.height) || 0
        const viewportContentHeight = Math.max(containerHeight - paddingTop - paddingBottom, 0)
        const scrollable = contentHeight > viewportContentHeight + 2

        if (scrollable !== this.data.enableInnerScroll) {
          this.setData({ enableInnerScroll: scrollable })
        }
      })
    }, 16) as unknown as number
  },
})
