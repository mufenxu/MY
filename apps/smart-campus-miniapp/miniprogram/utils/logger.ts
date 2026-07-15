// 日志工具函数
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FILTER = 'FILTER', // 用于过滤的关键日志
}

let env = 'develop'
try {
  const info = (wx as any).getAccountInfoSync && (wx as any).getAccountInfoSync()
  env = (info && info.miniProgram && info.miniProgram.envVersion) || 'develop'
} catch (e) {
  env = 'develop'
}
const isDev = env === 'develop'
const isProd = env === 'release'

// 获取实时日志管理器
const logManager = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null

function getLogPrefix(level: LogLevel, tag?: string): string {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const tagStr = tag ? `[${tag}]` : ''
  return `[${time}][${level}]${tagStr}`
}

export function debug(message: string, data?: any, tag?: string): void {
  if (!isDev) return
  const prefix = getLogPrefix(LogLevel.DEBUG, tag)
  data !== undefined ? console.log(prefix, message, data) : console.log(prefix, message)
}

export function info(message: string, data?: any, tag?: string): void {
  // Console logging
  if (!isProd) {
    const prefix = getLogPrefix(LogLevel.INFO, tag)
    data !== undefined ? console.log(prefix, message, data) : console.log(prefix, message)
  }

  // Realtime logging
  if (logManager) {
    const content = tag ? `[${tag}] ${message}` : message
    data !== undefined ? logManager.info(content, data) : logManager.info(content)
  }
}

export function warn(message: string, data?: any, tag?: string): void {
  const prefix = getLogPrefix(LogLevel.WARN, tag)
  data !== undefined ? console.warn(prefix, message, data) : console.warn(prefix, message)

  if (logManager) {
    const content = tag ? `[${tag}] ${message}` : message
    data !== undefined ? logManager.warn(content, data) : logManager.warn(content)
  }
}

export function error(message: string, data?: any, tag?: string): void {
  const prefix = getLogPrefix(LogLevel.ERROR, tag)
  data !== undefined ? console.error(prefix, message, data) : console.error(prefix, message)

  if (logManager) {
    const content = tag ? `[${tag}] ${message}` : message
    data !== undefined ? logManager.error(content, data) : logManager.error(content)
  }
}

// 关键过滤器日志 (用于搜索)
export function filter(key: string, data: any): void {
  if (logManager && logManager.setFilterMsg) {
    logManager.setFilterMsg(key)
  }
  if (!isProd) {
    console.log(`[FILTER:${key}]`, data)
  }
}

export function safeExecute<T>(fn: () => T, errorMsg: string, tag?: string, defaultValue?: T): T | undefined {
  try {
    return fn()
  } catch (err) {
    error(errorMsg, err, tag)
    return defaultValue
  }
}

export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  errorMsg: string,
  tag?: string,
  defaultValue?: T
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    error(errorMsg, err, tag)
    return defaultValue
  }
}

export function showLoading(title: string = '加载中...'): void {
  wx.showLoading({ title, mask: true })
}

export function hideLoading(): void {
  wx.hideLoading()
}

export function showSuccess(title: string, duration: number = 2000): void {
  wx.showToast({ title, icon: 'success', duration })
}

export function showError(title: string, duration: number = 2000): void {
  wx.showToast({ title, icon: 'none', duration })
}

export async function withLoading<T>(fn: () => Promise<T>, loadingText: string = '加载中...'): Promise<T> {
  showLoading(loadingText)
  try {
    return await fn()
  } finally {
    hideLoading()
  }
}

