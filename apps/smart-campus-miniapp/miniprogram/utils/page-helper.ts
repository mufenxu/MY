// 页面辅助函数
import * as storage from './storage'
import { isLocalFilePath } from './auth'
import request from './request'

export function getAppInstance(): any {
  return getApp()
}

// Deprecated: No longer used
export function getMpServerless(): any {
  return null
}

export function getCurrentRoute(): string {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  return (currentPage && currentPage.route) || ''
}

export function isCurrentPage(route: string): boolean {
  return getCurrentRoute() === route
}

export function navigateTo(url: string, method: 'navigateTo' | 'redirectTo' | 'reLaunch' = 'navigateTo'): void {
  try {
    if (method === 'reLaunch') {
      wx.reLaunch({ url })
    } else if (method === 'redirectTo') {
      wx.redirectTo({ url })
    } else {
      wx.navigateTo({ url })
    }
  } catch (err) {
    try {
      wx.navigateTo({ url })
    } catch (e) {
      console.error('导航失败:', e)
    }
  }
}

export function guardAndNavigate(url: string, loginUrl: string = '/pages/login/index'): void {
  const isLoggedIn = storage.getLoginStatus()
  if (!isLoggedIn) {
    wx.showToast({ title: '请先登录', icon: 'none', duration: 1500 })
    navigateTo(loginUrl)
    return
  }
  navigateTo(url)
}

export function ensurePrivacy(): void {
  const app = getAppInstance()
  if (app && app.ensurePrivacy && typeof app.ensurePrivacy === 'function') {
    app.ensurePrivacy()
  }
}

export function openPrivacyContract(): void {
  try {
    if (typeof (wx as any).openPrivacyContract === 'function') {
      ; (wx as any).openPrivacyContract({})
    }
  } catch (err) {
    // ignore
  }
}

export function getMenuButtonBoundingClientRect(): WechatMiniprogram.Rect | null {
  try {
    return (wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect()) || null
  } catch (err) {
    return null
  }
}

export function formatTimestamp(timestamp: number | string): string {
  if (!timestamp) return ''

  try {
    const date = typeof timestamp === 'string' && isNaN(Number(timestamp))
      ? new Date(timestamp)
      : new Date(Number(timestamp))
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}`
  } catch (err) {
    return ''
  }
}

export function formatUserId(
  userId: string | number,
  fullIdThreshold: number = 14,
  prefixLength: number = 6,
  suffixLength: number = 4
): string {
  const id = String(userId || '')
  if (!id) return ''

  if (id.length <= fullIdThreshold) {
    return id
  }

  return `${id.slice(0, prefixLength)}...${id.slice(-suffixLength)}`
}

export async function refreshUserRole(pageInstance: any, forceRefresh: boolean = false): Promise<void> {
  if (!storage.getLoginStatus()) {
    if (pageInstance.setData) {
      pageInstance.setData({ isSuperAdmin: false })
    }
    return
  }

  const CACHE_KEY = 'userRoleCache'
  const CACHE_DURATION = 120000 // 2分钟 (原来是10分钟,现在缩短以便更快刷新权限)

  // 1. 尝试读取缓存
  const cache = wx.getStorageSync(CACHE_KEY)
  const now = Date.now()
  let usedCache = false

  // 如果有缓存，优先使用缓存渲染（Stale-While-Revalidate）
  if (cache && cache.role) {
    if (pageInstance.setData) {
      const isSuperAdmin = cache.role === 'super_admin'
      // 仅当当前状态与缓存不一致时才更新，避免无谓渲染
      if (pageInstance.data.isSuperAdmin !== isSuperAdmin) {
        pageInstance.setData({ isSuperAdmin })
      }
    }
    usedCache = true
  } else {
    // 无缓存时，尝试从 storage 读取旧的角色信息作为兜底
    const role = storage.getUserRole()
    if (role) {
      if (pageInstance.setData) {
        pageInstance.setData({ isSuperAdmin: role === 'super_admin' })
      }
      usedCache = true
    }
  }

  // 2. 判断是否需要发起网络请求
  // 如果强制刷新，或者没有使用缓存，或者缓存已过期，则发起请求
  if (forceRefresh || !usedCache || (cache && now - cache.timestamp > CACHE_DURATION)) {

    // 异步更新，不 await，以免阻塞 UI（如果已经使用了缓存）
    const updatePromise = (async () => {
      try {
        // 从服务器获取最新用户信息
        const res = await request('/users/me')

        if (!res || !res.success) {
          throw new Error('Failed to fetch user info')
        }

        const userDoc = res.user
        const role = (userDoc && userDoc.role) || 'user'
        const permissions = (userDoc && userDoc.permissions) || []

        // 头像始终使用本地 storage（因为头像是本地临时路径，不上传服务器）
        const localAvatarUrl = storage.getAvatarUrl()
        const localNickName = storage.getNickName()

        // 服务器返回的 avatarUrl 如果是本地路径则忽略
        const serverAvatarUrl = (userDoc.avatarUrl && userDoc.avatarUrl.trim() && !isLocalFilePath(userDoc.avatarUrl))
          ? userDoc.avatarUrl : ''

        const mergedUser = {
          ...userDoc,
          // 头像优先使用本地存储，服务器的本地路径无效
          avatarUrl: localAvatarUrl || serverAvatarUrl,
          nickName: (userDoc.nickName && userDoc.nickName.trim()) ? userDoc.nickName : localNickName,
        }

        // 更新本地存储的用户信息
        try {
          wx.setStorageSync('user', mergedUser)
        } catch (err) {
          // ignore
        }

        // 更新 UI,包括头像、昵称以及管理员标识（如果有）
        if (pageInstance.setData) {
          const updates: any = {};
          if (mergedUser.avatarUrl) updates.avatarUrl = mergedUser.avatarUrl;
          if (mergedUser.nickName) updates.nickName = mergedUser.nickName;
          // 超级管理员标识
          const isSuperAdmin = mergedUser.role === 'super_admin';
          updates.isSuperAdmin = isSuperAdmin;
          updates.permissions = permissions;

          // 只在有变化时 setData，避免不必要渲染
          if (Object.keys(updates).length > 0) {
            pageInstance.setData(updates);
          }
        }

        // 更新缓存
        try {
          wx.setStorageSync('userRole', role)
          storage.setPermissions(permissions)
          wx.setStorageSync(CACHE_KEY, { role, permissions, timestamp: Date.now() })

          // 昵称从服务器同步到本地（头像不同步，因为是本地路径）
          if (mergedUser.nickName && mergedUser.nickName.trim()) {
            storage.setNickName(mergedUser.nickName)
          }
        } catch (err) {
          // ignore
        }
      } catch (err) {
        console.error('[refreshUserRole] Update failed:', err)
        // 如果之前没有使用缓存，这里需要处理错误状态
        if (!usedCache && pageInstance.setData) {
          pageInstance.setData({ isSuperAdmin: false })
        }
      }
    })()

    // 如果没有使用缓存，我们需要等待请求完成，否则页面可能显示错误状态
    if (!usedCache) {
      await updatePromise
    }
  }
}

// 安全获取入口参数/来源信息，避免 undefined 读取报错
type SafeLaunchOptions = Partial<WechatMiniprogram.LaunchOptionsApp> & { referrerInfo: any; query: any }

export function getSafeEnterOptions(): SafeLaunchOptions {
  const fallback: SafeLaunchOptions = { referrerInfo: {} as any, query: {} as any }
  try {
    const raw = (typeof wx.getEnterOptionsSync === 'function'
      ? wx.getEnterOptionsSync()
      : (typeof wx.getLaunchOptionsSync === 'function' ? wx.getLaunchOptionsSync() : null)) as Partial<WechatMiniprogram.LaunchOptionsApp> | null
    if (raw && typeof raw === 'object') {
      return Object.assign({}, fallback, raw) as SafeLaunchOptions
    }
    return fallback
  } catch (err) {
    return fallback
  }
}

export function getSafeReferrerInfo(): any {
  const options = getSafeEnterOptions()
  return options.referrerInfo || {}
}
