// app.ts
import * as logger from './utils/logger'
import { ensureAuthorized } from './utils/auth'

interface IAppOption {
  globalData: {
    // mpServerless: any // Removed
  }
  ensurePrivacy(): void
}

/**
 * 为部分基础库/端上行为差异兜底
 */
function patchEnterOptionsSafely(): void {
  try {
    const wxAny = wx as any
    const wrap = (fnName: string) => {
      const original = typeof wxAny[fnName] === 'function' ? wxAny[fnName].bind(wxAny) : null
      wxAny[fnName] = function () {
        let options: any = {}
        try {
          options = original ? (original() || {}) : {}
        } catch (e) {
          options = {}
        }
        if (!options || typeof options !== 'object') options = {}
        if (!options.referrerInfo) options.referrerInfo = {}
        if (!options.query) options.query = {}
        return options
      }
    }
    wrap('getEnterOptionsSync')
    wrap('getLaunchOptionsSync')
  } catch (err) {
    // ignore
  }
}

App<IAppOption>({
  globalData: {
    // mpServerless: mpServerlessInstance // Removed
  },

  ensurePrivacy() {
    try {
      const getPrivacySetting = (wx as any).getPrivacySetting
      if (typeof getPrivacySetting !== 'function') return
      getPrivacySetting({
        success: (res: any) => {
          if (res && res.needAuthorization) {
            const requirePrivacyAuthorize = (wx as any).requirePrivacyAuthorize
            if (typeof requirePrivacyAuthorize === 'function') {
              requirePrivacyAuthorize({
                success: () => { },
                fail: () => {
                  const openPrivacyContract = (wx as any).openPrivacyContract
                  if (typeof openPrivacyContract === 'function') {
                    openPrivacyContract({})
                  }
                },
              })
            } else {
              wx.showModal({
                title: '用户隐私保护指引',
                content: '为向你提供头像/昵称设置、登录等功能，我们将依据《用户隐私保护指引》处理你的个人信息，请阅读并同意后继续使用。',
                confirmText: '查看并同意',
                success: (modalRes: any) => {
                  const openPrivacyContract = (wx as any).openPrivacyContract
                  if (modalRes.confirm && typeof openPrivacyContract === 'function') {
                    openPrivacyContract({})
                  }
                },
              })
            }
          }
        },
      })
    } catch (err) {
      logger.error('Privacy check error:', err, 'App')
    }
  },

  onLaunch() {
    patchEnterOptionsSafely()

    // 生产环境降噪 — 尽量使用同步快速路径
    try {
      const info = (wx as any).getAccountInfoSync && (wx as any).getAccountInfoSync()
      const env = (info && info.miniProgram && info.miniProgram.envVersion) || 'develop'
      if (env === 'release') {
        const noop = () => { }
          ; (console as any).log = noop
          ; (console as any).info = noop
          ; (console as any).warn = noop
      }
    } catch (e) {
      // ignore
    }

    logger.debug('App Launch', undefined, 'App')

    // 捕获未处理的 Promise 异常
    if (wx.onUnhandledRejection) {
      wx.onUnhandledRejection((res) => {
        logger.error('Unhandled Promise Rejection', res.reason, 'App')
      })
    }

    // 将登录和隐私检查延迟到下一个事件循环执行，不阻塞首页渲染
    setTimeout(() => {
      ensureAuthorized().catch(err => {
        logger.error('App Launch Login Failed', err, 'App')
      })

      if (this.ensurePrivacy) {
        this.ensurePrivacy()
      }
    }, 0)
  },

  onError(err: string) {
    logger.error('App Error', err, 'App')
    wx.showModal({
      title: '应用错误',
      content: String(err),
      showCancel: false,
    })
  },
})