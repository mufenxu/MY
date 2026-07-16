// 配置文件
type RuntimeEnv = 'develop' | 'trial' | 'release'

interface RuntimeConfig {
  apiBaseUrl: string
  libroomBaseUrl: string
  tempHumidityBaseUrl: string
}

const DEFAULT_API_BASE_URL = 'https://pxyb.cn/api/core'
const DEFAULT_LIBROOM_BASE_URL = 'https://pxyb.cn/api/campus'
const DEFAULT_TEMP_HUMIDITY_BASE_URL = 'https://pxyb.cn/api/iot'

const DEV_API_OVERRIDE_KEY = 'dev_api_base_url'

const CONFIG_BY_ENV: Record<RuntimeEnv, RuntimeConfig> = {
  develop: {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    libroomBaseUrl: DEFAULT_LIBROOM_BASE_URL,
    tempHumidityBaseUrl: DEFAULT_TEMP_HUMIDITY_BASE_URL,
  },
  trial: {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    libroomBaseUrl: DEFAULT_LIBROOM_BASE_URL,
    tempHumidityBaseUrl: DEFAULT_TEMP_HUMIDITY_BASE_URL,
  },
  release: {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    libroomBaseUrl: DEFAULT_LIBROOM_BASE_URL,
    tempHumidityBaseUrl: DEFAULT_TEMP_HUMIDITY_BASE_URL,
  },
}

function normalizeBaseUrl(url: string): string {
  return String(url || '').replace(/\/+$/, '')
}

function joinUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`
}

function detectRuntimeEnv(): RuntimeEnv {
  try {
    const info = (wx as any).getAccountInfoSync && (wx as any).getAccountInfoSync()
    const env = info && info.miniProgram && info.miniProgram.envVersion
    if (env === 'develop' || env === 'trial' || env === 'release') {
      return env
    }
  } catch (err) {
    // ignore
  }
  return 'release'
}

function readDevelopOverride(env: RuntimeEnv, fallback: string): string {
  if (env === 'release') return fallback

  try {
    const override = wx.getStorageSync(DEV_API_OVERRIDE_KEY)
    if (typeof override === 'string' && /^https?:\/\//i.test(override.trim())) {
      return normalizeBaseUrl(override.trim())
    }
  } catch (err) {
    // ignore
  }

  return fallback
}

export const CURRENT_ENV: RuntimeEnv = detectRuntimeEnv()

export const APP_CONFIG: RuntimeConfig = {
  ...CONFIG_BY_ENV[CURRENT_ENV],
  apiBaseUrl: readDevelopOverride(CURRENT_ENV, CONFIG_BY_ENV[CURRENT_ENV].apiBaseUrl),
}

export const API_BASE_URL = normalizeBaseUrl(APP_CONFIG.apiBaseUrl)
export const API_PREFIX = joinUrl(API_BASE_URL, '/api')

// 开发版本地调试可在调试器里执行：
// wx.setStorageSync('dev_api_base_url', 'http://localhost:3045')
export const DEV_CONFIG_KEYS = {
  API_BASE_URL: DEV_API_OVERRIDE_KEY,
}

export const CT8_ENDPOINTS = {
  trigger: joinUrl(API_PREFIX, '/github/trigger'),
  status: joinUrl(API_PREFIX, '/github/status'),
  updateSecret: joinUrl(API_PREFIX, '/github/secret/update'),
  secretCache: joinUrl(API_PREFIX, '/github/secret/cache'),
}

export const NOTIFY_API = {
  base: joinUrl(API_PREFIX, '/notifications'),
}

export const LIBROOM_API = {
  config: joinUrl(APP_CONFIG.libroomBaseUrl, '/api/config'),
  health: joinUrl(APP_CONFIG.libroomBaseUrl, '/api/health'),
}

export const EMQX_API = {
  publishUrl: joinUrl(API_PREFIX, '/iot/control'),
  target: 'primary',
  topic: 'home/esp8266/relay/set',
  clientId: 'miniapp-relay',
  qos: 1,
  payload: {
    on: 'ON',
    off: 'OFF',
  },
}

export const ESP01S_RELAY_API = {
  publishUrl: joinUrl(API_PREFIX, '/iot/control'),
  target: 'secondary',
  topic: 'home/relay/control',
  statusTopic: 'home/relay/status',
  clientId: 'miniapp-esp01s-relay',
  qos: 1,
  payload: {
    on: 'ON',
    off: 'OFF',
  },
}

export const TEMP_HUMIDITY_API = {
  baseUrl: normalizeBaseUrl(APP_CONFIG.tempHumidityBaseUrl),
  devicesEndpoint: '/api/devices',
  historyEndpoint: '/api/devices/:deviceId/history',
  pollingInterval: 8000, // 8秒轮询一次，降低前台功耗和请求压力
}
