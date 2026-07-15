// 常量定义
export const TIME = {
  SECOND: 1000,
  MINUTE: 60000,
  HOUR: 3600000,
  DAY: 86400000,
  TOAST_DURATION: 2000,
  TOAST_DURATION_SHORT: 1500,
  TOAST_DURATION_LONG: 3000,
  REQUEST_TIMEOUT: 10000,
  AUTO_REFRESH_INTERVAL: 10000,
  CACHE_COOLDOWN: 30000,
  DEBOUNCE_DELAY: 300,
  THROTTLE_INTERVAL: 500,
}

export const ROUTES = {
  INDEX: '/pages/index/index',
  ME: '/pages/me/index',
  LOGIN: '/pages/login/index',

  CT8_DETAIL: '/pages/ct8-management/detail',
  CT8_MANAGEMENT: '/pages/ct8-management/index',

  RESOURCES: '/pages/resources/index',
  BMI: '/pages/bmi/index',

  TODO: '/pages/todo/index',
  SMART_CONTROL: '/pages/smart-control/index',
  HEAT_PUMP: '/pages/smart-control/heat-pump/index',


  COURSE_QUERY: '/pages/course/query/index',
  COURSE_ORDERS: '/pages/course/orders/index',
}

export const ROLE_LABELS: Record<string, string> = {
  user: '普通用户',
  admin: '管理员',
  super_admin: '超级管理员',
}

export const STATUS_LABELS: Record<string, string> = {
  active: '正常',
  banned: '已封禁',
}

export const CLOUD_FUNCTIONS = {
  USER_API: 'userApi',
  USER_ADMIN: 'userAdmin',
  DUE_REMINDER: 'dueReminder',

  TODO_REMINDER: 'todoReminder',
}

export const USER_API_ACTIONS = {
  PING: 'ping',
  GET_SELF: 'getSelf',
  UPDATE_SELF_PROFILE: 'updateSelfProfile',
}

export const MESSAGES = {
  LOGIN_REQUIRED: '请先登录',
  LOGIN_SUCCESS: '登录成功',
  LOGIN_FAILED: '登录失败',
  LOGOUT_SUCCESS: '已退出',
  LOADING: '加载中...',
  PROCESSING: '处理中...',
  SUBMITTING: '提交中...',
  AVATAR_REQUIRED: '请先选择头像',
  NICKNAME_REQUIRED: '请输入昵称',
  NETWORK_ERROR: '网络错误',
  REQUEST_FAILED: '请求失败',
  COPY_SUCCESS: '已复制',
  SAVE_SUCCESS: '保存成功',
  DELETE_SUCCESS: '删除成功',
  NO_PERMISSION: '无权限访问',
  FEATURE_RESTRICTED: '功能受限',
}

export const ERROR_CODES = {
  UNKNOWN: 'UNKNOWN_ERROR',
  NETWORK: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT_ERROR',
  AUTH_FAILED: 'AUTH_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_PARAMS: 'INVALID_PARAMS',
}

export const RETRY_CONFIG = {
  DEFAULT_TRIES: 2,
  DEFAULT_DELAY: 500,
  MAX_TRIES: 3,
}

export const USER_ID_DISPLAY = {
  FULL_ID_THRESHOLD: 14,
  PREFIX_LENGTH: 6,
  SUFFIX_LENGTH: 4,
}

export const DB_COLLECTIONS = {
  USERS: 'users',
  RESOURCES: 'resources',
  TODO_LISTS: 'todo_lists',
}

export const REGEX = {
  OPENID: /^o[A-Za-z0-9_-]{20,}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^1[3-9]\d{9}$/,
}

export const DEFAULTS = {
  AVATAR_URL: '',
  NICK_NAME: '访客用户',
  ROLE: 'user',
  STATUS: 'active',
  PAGE_SIZE: 20,
}

