type RoleName = 'guest' | 'user' | 'admin' | 'super_admin'

interface FeatureVisibilityItem {
  enabled?: boolean
  minRole?: RoleName
}

export type FeatureVisibilityConfig = Record<string, FeatureVisibilityItem>

interface FeatureVisibilityContext {
  config: FeatureVisibilityConfig | null
  userRole: string
  permissions: string[]
  isSuperAdmin: boolean
  envVersion?: string
}

interface BaseFeatureFlagsContext {
  loggedIn: boolean
  isSuperAdmin: boolean
}

const ROLE_WEIGHTS: Record<RoleName, number> = {
  guest: 0,
  user: 1,
  admin: 2,
  super_admin: 3,
}

const PUBLIC_TOOL_KEYS = ['bmi', 'todo']

const FEATURE_FIELD_MAP = [
  { key: 'resources', field: 'canViewResources' },
  { key: 'bmi', field: 'canViewBMI' },
  { key: 'todo', field: 'canViewTodo' },
  { key: 'ct8', field: 'canViewCT8' },
  { key: 'smart_control', field: 'canViewSmartControl' },
  { key: 'heat_pump', field: 'canViewHeatPump' },
  { key: 'daily_news', field: 'canViewDailyNews' },
  { key: 'course_order', field: 'canViewCourseOrder' },
]

export function getMiniProgramEnvVersion(): string {
  try {
    const info = (wx as any).getAccountInfoSync ? (wx as any).getAccountInfoSync() : null
    return (info && info.miniProgram && info.miniProgram.envVersion) || 'develop'
  } catch (err) {
    return 'develop'
  }
}

export function getBaseFeatureVisibilityFlags(context: BaseFeatureFlagsContext): Record<string, boolean> {
  const { loggedIn, isSuperAdmin } = context

  return {
    isSuperAdmin,
    canViewResources: false,
    canViewBMI: true,
    canViewTodo: true,
    canViewCT8: false,
    canViewSmartControl: false,
    canViewHeatPump: false,
    canViewDailyNews: false,
    canViewCourseOrder: loggedIn,
  }
}

export function calculateFeatureVisibility(context: FeatureVisibilityContext): Record<string, boolean> {
  const { config, permissions, isSuperAdmin } = context
  if (!config) return {}

  const userRole = (context.userRole || 'guest') as RoleName
  const userWeight = ROLE_WEIGHTS[userRole] || 0
  const envVersion = context.envVersion || getMiniProgramEnvVersion()
  const isRelease = envVersion === 'release'
  const data: Record<string, boolean> = {}

  FEATURE_FIELD_MAP.forEach(({ key, field }) => {
    const item = config[key]
    if (!item) return

    if (item.enabled === false) {
      data[field] = false
      return
    }

    if (item.enabled !== true) return

    const minRole = item.minRole || 'user'
    const requiredWeight = ROLE_WEIGHTS[minRole] || ROLE_WEIGHTS.user
    const isPublicTool = PUBLIC_TOOL_KEYS.includes(key)
    const isUserLevel = minRole === 'user'
    const hasRoleAccess = userWeight >= requiredWeight || (isUserLevel && userRole === 'guest' && isPublicTool)
    const hasIndividualPrivilege = permissions.includes(key) || permissions.includes(`view_${key}`)

    if (!isRelease && key === 'daily_news') {
      data[field] = hasRoleAccess || hasIndividualPrivilege
      return
    }

    data[field] = isSuperAdmin || hasRoleAccess || hasIndividualPrivilege
  })

  return data
}
