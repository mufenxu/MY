// 本地存储工具函数
export const STORAGE_KEYS = {
  IS_LOGGED_IN: 'isLoggedIn',
  AVATAR_URL: 'avatarUrl',
  NICK_NAME: 'nickName',
  USER_ROLE: 'userRole',
  USER_ROLE_CACHE: 'userRoleCache',
  PERMISSIONS: 'permissions',
  UID_CACHE: 'uidCache',
  ME_USER_PROFILE: 'me_userProfile',
  LIBROOM_CONFIG_TOKEN: 'libroomConfigToken',
  TOKEN: 'token',
  USER: 'user',
}

export function getStorage<T>(key: string, defaultValue: T): T {
  try {
    const value = wx.getStorageSync(key)
    return value !== '' && value != null ? value : defaultValue
  } catch (err) {
    console.warn(`[Storage] Failed to get ${key}:`, err)
    return defaultValue
  }
}

export function setStorage(key: string, value: any): boolean {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (err) {
    console.warn(`[Storage] Failed to set ${key}:`, err)
    return false
  }
}

export function removeStorage(key: string): boolean {
  try {
    wx.removeStorageSync(key)
    return true
  } catch (err) {
    console.warn(`[Storage] Failed to remove ${key}:`, err)
    return false
  }
}

export function removeStorageMultiple(keys: string[]): void {
  keys.forEach(key => removeStorage(key))
}

export function getLoginStatus(): boolean {
  return !!getStorage(STORAGE_KEYS.IS_LOGGED_IN, false) && !!getStorage(STORAGE_KEYS.TOKEN, '')
}

export function setLoginStatus(status: boolean): boolean {
  return setStorage(STORAGE_KEYS.IS_LOGGED_IN, status)
}

export function getAvatarUrl(): string {
  return getStorage(STORAGE_KEYS.AVATAR_URL, '')
}

export function setAvatarUrl(url: string): boolean {
  return setStorage(STORAGE_KEYS.AVATAR_URL, url)
}

export function getNickName(): string {
  return getStorage(STORAGE_KEYS.NICK_NAME, '')
}

export function setNickName(name: string): boolean {
  return setStorage(STORAGE_KEYS.NICK_NAME, name)
}

export function getUserRole(): string {
  return getStorage(STORAGE_KEYS.USER_ROLE, 'user')
}

export function setUserRole(role: string): boolean {
  return setStorage(STORAGE_KEYS.USER_ROLE, role)
}

export function getPermissions(): string[] {
  return getStorage(STORAGE_KEYS.PERMISSIONS, [])
}

export function setPermissions(permissions: string[]): boolean {
  return setStorage(STORAGE_KEYS.PERMISSIONS, permissions)
}

export function getUidCache(): any {
  return getStorage(STORAGE_KEYS.UID_CACHE, null)
}

export function setUidCache(cache: any): boolean {
  return setStorage(STORAGE_KEYS.UID_CACHE, cache)
}

export function getUserProfile(): any {
  return getStorage(STORAGE_KEYS.ME_USER_PROFILE, null)
}

export function setUserProfile(profile: any): boolean {
  return setStorage(STORAGE_KEYS.ME_USER_PROFILE, profile)
}

export function getLibroomConfigToken(): string {
  return getStorage(STORAGE_KEYS.LIBROOM_CONFIG_TOKEN, '')
}

export function setLibroomConfigToken(token: string): boolean {
  return setStorage(STORAGE_KEYS.LIBROOM_CONFIG_TOKEN, token)
}

export function isAdmin(): boolean {
  const role = getUserRole()
  return role === 'admin' || role === 'super_admin'
}

export function isSuperAdmin(): boolean {
  return getUserRole() === 'super_admin'
}

export function clearLoginStorage(): void {
  removeStorageMultiple([
    STORAGE_KEYS.IS_LOGGED_IN,
    STORAGE_KEYS.AVATAR_URL,
    STORAGE_KEYS.NICK_NAME,
    STORAGE_KEYS.USER_ROLE,
    STORAGE_KEYS.USER_ROLE_CACHE,
    STORAGE_KEYS.PERMISSIONS,
    STORAGE_KEYS.UID_CACHE,
    STORAGE_KEYS.ME_USER_PROFILE,
    STORAGE_KEYS.TOKEN,
    STORAGE_KEYS.USER,
  ])
}

/**
 * 执行登出操作
 * @returns 返回登出状态数据，用于 setData
 */
export function logout(): {
  loggedIn: boolean
  avatarUrl: string
  nickName: string
  isSuperAdmin: boolean
  showLogout?: boolean
} {
  clearLoginStorage()
  return {
    loggedIn: false,
    avatarUrl: '',
    nickName: '',
    isSuperAdmin: false,
    showLogout: false,
  }
}
