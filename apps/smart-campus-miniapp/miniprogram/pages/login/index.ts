// pages/login/index.ts
import * as auth from '../../utils/auth'
import * as pageHelper from '../../utils/page-helper'
import * as storage from '../../utils/storage'
import * as constants from '../../utils/constants'
import * as logger from '../../utils/logger'
import { persistLoginSession } from '../../utils/session'

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    canLogin: false,
    loggingIn: false,
    isAgreed: false,
  },

  onLoad() {
    pageHelper.ensurePrivacy()
  },

  updateLoginStatus() {
    const { avatarUrl, nickName } = this.data
    const canLogin = !!(avatarUrl && nickName && nickName.trim())
    this.setData({ canLogin })
  },

  onAgreedChange(e: any) {
    this.setData({
      isAgreed: e.detail.value.length > 0
    })
  },

  async onChooseAvatar(e: any) {
    const tempAvatarUrl = e.detail.avatarUrl

    // 直接使用临时头像
    this.setData({ avatarUrl: tempAvatarUrl })
    storage.setAvatarUrl(tempAvatarUrl)

    this.updateLoginStatus()

    // 头像选择成功后，提示用户输入昵称
    if (!this.data.nickName) {
      setTimeout(() => {
        wx.showToast({
          title: '请输入昵称完成登录',
          icon: 'none',
          duration: 2000
        })
      }, 500)
    }
  },

  onNickInput(e: any) {
    const nickName = e.detail.value
    this.setData({ nickName })
    this.updateLoginStatus()
  },

  onNickBlur(e: any) {
    const nickName = e.detail.value
    if (nickName && nickName.trim()) {
      storage.setNickName(nickName)
    }
  },

  async onLogin() {
    if (!this.data.isAgreed) {
      wx.showToast({
        title: '请先阅读并同意隐私保护指引',
        icon: 'none'
      })
      return
    }

    if (!this.data.canLogin) {
      if (!this.data.avatarUrl) {
        logger.showError(constants.MESSAGES.AVATAR_REQUIRED)
      } else if (!this.data.nickName || !this.data.nickName.trim()) {
        logger.showError(constants.MESSAGES.NICKNAME_REQUIRED)
      }
      return
    }

    if (this.data.loggingIn) {
      return
    }

    try {
      this.setData({ loggingIn: true })

      const nickName = this.data.nickName
      const avatarUrl = this.data.avatarUrl

      // Call ensureAuthorized with userInfo to trigger registration/update
      await auth.ensureAuthorized({ nickName, avatarUrl })

      const user = wx.getStorageSync('user')
      persistLoginSession(user, { nickName, avatarUrl })

      wx.navigateBack()
    } catch (err: any) {
      // 优先从返回数据中提取具体的错误描述
      let errMsg = constants.MESSAGES.LOGIN_FAILED
      if (typeof err === 'string') {
        errMsg = err
      } else if (err && typeof err === 'object') {
        errMsg = err.message || err.error || err.errMsg || errMsg
      }
      logger.showError(errMsg)
    } finally {
      this.setData({ loggingIn: false })
    }
  },

  onOpenPrivacy() {
    pageHelper.openPrivacyContract()
  },
})
