import * as storage from './storage'

export interface SessionSnapshot {
  loggedIn: boolean
  avatarUrl: string
  nickName: string
  role: string
  permissions: string[]
  isAdmin: boolean
  isSuperAdmin: boolean
  user: any | null
}

interface PersistLoginOptions {
  avatarUrl?: string
  nickName?: string
}

export interface LogoutViewData {
  loggedIn: boolean
  avatarUrl: string
  nickName: string
  isSuperAdmin: boolean
  showLogout?: boolean
  userProfile?: null
  isAdmin?: boolean
}

function readStoredUser(): any | null {
  try {
    const user = wx.getStorageSync(storage.STORAGE_KEYS.USER)
    return user && typeof user === 'object' ? user : null
  } catch (err) {
    return null
  }
}

function writeStoredUser(user: any): void {
  try {
    wx.setStorageSync(storage.STORAGE_KEYS.USER, user)
  } catch (err) {
    // ignore
  }
}

export function getSessionSnapshot(): SessionSnapshot {
  const user = readStoredUser()
  const loggedIn = storage.getLoginStatus()
  const role = loggedIn
    ? (user && user.role) || storage.getUserRole() || 'user'
    : 'guest'
  const permissions = loggedIn
    ? ((user && Array.isArray(user.permissions) && user.permissions) || storage.getPermissions() || [])
    : []
  const avatarUrl = storage.getAvatarUrl() || (user && user.avatarUrl) || ''
  const nickName = storage.getNickName() || (user && user.nickName) || ''

  return {
    loggedIn,
    avatarUrl,
    nickName,
    role,
    permissions,
    isAdmin: role === 'admin' || role === 'super_admin',
    isSuperAdmin: role === 'super_admin',
    user,
  }
}

export function persistLoginSession(user?: any, options: PersistLoginOptions = {}): SessionSnapshot {
  const nextUser = user || readStoredUser() || {}
  const role = nextUser.role || storage.getUserRole() || 'user'
  const permissions = Array.isArray(nextUser.permissions) ? nextUser.permissions : storage.getPermissions()
  const nickName = options.nickName || nextUser.nickName || storage.getNickName()
  const avatarUrl = options.avatarUrl || storage.getAvatarUrl() || nextUser.avatarUrl || ''
  const mergedUser = {
    ...nextUser,
    role,
    permissions,
    nickName,
    avatarUrl,
  }

  storage.setLoginStatus(true)
  storage.setUserRole(role)
  storage.setPermissions(permissions)
  if (nickName) storage.setNickName(nickName)
  if (avatarUrl) storage.setAvatarUrl(avatarUrl)
  writeStoredUser(mergedUser)

  try {
    wx.setStorageSync(storage.STORAGE_KEYS.USER_ROLE_CACHE, {
      role,
      permissions,
      timestamp: Date.now(),
    })
  } catch (err) {
    // ignore
  }

  return getSessionSnapshot()
}

export function clearLoginSession(): LogoutViewData {
  storage.clearLoginStorage()
  return {
    loggedIn: false,
    avatarUrl: '',
    nickName: '',
    isSuperAdmin: false,
    showLogout: false,
    userProfile: null,
    isAdmin: false,
  }
}
