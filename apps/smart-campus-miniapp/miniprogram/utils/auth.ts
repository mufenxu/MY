import request from './request'
import * as storage from './storage'
import * as logger from './logger'
import { persistLoginSession } from './session'

// 缓存 Promise 避免并发重复请求
let loginPromise: Promise<any> | null = null

const LOGIN_RATE_LIMIT_KEY = 'auth_login_rate_limit_until'
const LOGIN_RATE_LIMIT_COOLDOWN = 60 * 60 * 1000

// 内存缓存 Token，减少同步读取 Storage
let tokenCache: string | null = null

export interface User {
  _id: string
  openid: string
  nickName?: string
  avatarUrl?: string
  role?: string
  status?: string
}

export interface LoginResponse {
  success: boolean
  token: string
  user: User
  error?: string
}

interface LoginPayload {
  code: string
  userInfo?: {
    nickName: string
  }
}

function getErrorMessage(err: any): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  return err.message || err.error || err.errMsg || ''
}

function isRateLimitError(err: any): boolean {
  const msg = getErrorMessage(err)
  return err?.statusCode === 429 ||
    err?.code === 429 ||
    /429|too many|频繁/.test(msg.toLowerCase())
}

function getLoginRateLimitUntil(): number {
  try {
    const value = Number(wx.getStorageSync(LOGIN_RATE_LIMIT_KEY))
    return Number.isFinite(value) ? value : 0
  } catch (e) {
    return 0
  }
}

function clearLoginRateLimit(): void {
  try {
    wx.removeStorageSync(LOGIN_RATE_LIMIT_KEY)
  } catch (e) {
    // ignore
  }
}

function markLoginRateLimited(err: any): void {
  let cooldownMs = LOGIN_RATE_LIMIT_COOLDOWN
  if (err && typeof err === 'object') {
    const retryAfterSeconds = Number(err.retryAfter || err.retry_after)
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      cooldownMs = retryAfterSeconds * 1000
    }
  }

  try {
    wx.setStorageSync(LOGIN_RATE_LIMIT_KEY, Date.now() + cooldownMs)
  } catch (e) {
    // ignore
  }
}

function createRateLimitError(until: number): Error {
  const remainingMinutes = Math.max(1, Math.ceil((until - Date.now()) / 60000))
  return new Error(`登录尝试过于频繁，请 ${remainingMinutes} 分钟后再试`)
}

// 判断是否为本地临时文件路径（换设备后不可用）
export function isLocalFilePath(url: string): boolean {
  if (!url) return false
  return url.startsWith('http://tmp/') ||
    url.startsWith('wxfile://') ||
    url.startsWith('http://store/') ||
    url.includes('/tmp_') ||
    /^[a-zA-Z]:[\\\/]/.test(url)
}

// 获取 Token (优先从内存)
export function getToken(): string {
  if (tokenCache !== null) return tokenCache
  try {
    const t = wx.getStorageSync('token')
    if (t) {
      tokenCache = t
      return t
    }
  } catch (e) {
    // ignore
  }
  return ''
}

export function clearToken(): void {
  tokenCache = ''
  try {
    wx.removeStorageSync('token')
  } catch (e) {
    // ignore
  }
}

function isValidToken(): boolean {
  const token = getToken()
  if (!token) return false

  try {
    // Simple JWT decode to check expiration
    const parts = token.split('.')
    if (parts.length !== 3) return false

    const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1]))))
    const now = Math.floor(Date.now() / 1000)

    // Check if token is expired (give 60s buffer) and has correct issuer/audience
    if (payload.exp && payload.exp > now + 60) {
      if (payload.iss === 'miniprogram-admin' && payload.aud === 'miniprogram-api') {
        return true
      }
    }
    return false
  } catch (e) {
    return false
  }
}

// Polyfill for atob if needed (WeChat miniprogram might not have it globally, but let's try standard approach or simple base64 decode)
// Actually, WeChat environment usually supports basic base64 via buffer or similar, but let's implement a simple base64 decoder if atob is missing
// Or better, just use a simple replacement since we only need to decode the payload which is base64url
function atob(str: string): string {
  // @ts-ignore
  if (typeof global.atob === 'function') return global.atob(str)

  // Simple polyfill for base64 decode
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  let output = ''
  str = String(str).replace(/-/g, '+').replace(/_/g, '/')
  str = String(str).replace(/=+$/, '')
  for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = chars.indexOf(buffer)
  }
  return output
}


export async function ensureAuthorized(userInfo?: { nickName: string, avatarUrl?: string }): Promise<void> {
  // If userInfo is provided, we force a new login request to update/register
  // If no userInfo, we check if we have a valid token
  if (!userInfo && isValidToken()) {
    return
  }

  const rateLimitUntil = getLoginRateLimitUntil()
  if (rateLimitUntil > Date.now()) {
    if (!userInfo) return
    throw createRateLimitError(rateLimitUntil)
  } else if (rateLimitUntil) {
    clearLoginRateLimit()
  }

  if (loginPromise) return loginPromise

  loginPromise = (async () => {
    try {
      // 1. wx.login
      const { code } = await wx.login()

      // 2. Call Backend
      const payload: LoginPayload = { code }
      if (userInfo) {
        // 只发送昵称到服务器，头像不上传（因为是本地临时路径，换设备后不可用）
        payload.userInfo = { nickName: userInfo.nickName }
      }

      const res = await request<LoginResponse>('/auth/wechat-login', 'POST', payload, false, {
        showRateLimitModal: !!userInfo,
      })

      if (res.success && res.token) {
        clearLoginRateLimit()
        const wasLoggedIn = storage.getStorage(storage.STORAGE_KEYS.IS_LOGGED_IN, false)
        tokenCache = res.token // Update cache first
        wx.setStorageSync('token', res.token)
        wx.setStorageSync('user', res.user)
        storage.setUidCache({ id: res.user._id, label: 'openid', ts: Date.now() })
        if (userInfo || wasLoggedIn) {
          persistLoginSession(res.user, userInfo)
        }
      } else {
        // If it's a silent login (no userInfo) and user not found, just clear session
        if (!userInfo && res.error === 'User not registered') {
          tokenCache = ''
          wx.removeStorageSync('token')
          wx.removeStorageSync('user')
          return // Silent failure is expected for new users
        }
        throw new Error(res.error || 'Login failed')
      }
    } catch (err) {
      // Don't log error for expected "User not registered" in silent mode
      if (isRateLimitError(err)) {
        markLoginRateLimited(err)
        if (!userInfo) return
      }
      if (!userInfo && getErrorMessage(err) === 'User not registered') {
        return
      }
      logger.error('Login failed', err, 'Auth')
      throw err
    } finally {
      loginPromise = null
    }
  })()

  return loginPromise
}

export async function ensureUserDoc(
  nickName?: string
): Promise<User | null> {
  // 只发送昵称到服务器，头像不上传（本地临时路径换设备后不可用）
  if (nickName) {
    try {
      // Call update profile API (不传 avatarUrl)
      const res = await request<{ success: boolean, user: User }>('/users/me', 'PUT', { nickName })
      if (res.success && res.user) {
        wx.setStorageSync('user', res.user)
        return res.user
      }
    } catch (e) {
      logger.error('Update profile failed', e, 'Auth')
    }
  }

  const user = wx.getStorageSync('user')
  return user || null
}

export async function getOpenId(): Promise<string> {
  const user = wx.getStorageSync('user')
  return user ? user.openid : ''
}

export async function getCurrentUserId(): Promise<string> {
  const user = wx.getStorageSync('user')
  return user ? user._id : ''
}

export async function getCurrentIdAndLabel(): Promise<{ id: string; label: string }> {
  const user = wx.getStorageSync('user')
  if (user) {
    return { id: user._id, label: 'openid' }
  }
  return { id: '', label: '' }
}

// Stub for compatibility
export async function ensureMpReady(): Promise<void> {
  return
}

export async function ensureBrowseAuthorized(): Promise<void> {
  return ensureAuthorized()
}
