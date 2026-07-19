const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const OPERATOR_BLOCKED_PATHS = [
  /^\/api\/app-auth\/password(?:\/|$)/,
  /^\/api\/users(?:\/|$)/,
  /^\/api\/invites(?:\/|$)/,
];

export function platformRoleAllowsRequest(role, method = 'GET', pathname = '/') {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (role === 'super_admin') return true;
  if (role === 'viewer') return SAFE_METHODS.has(normalizedMethod);
  if (role !== 'operator') return false;
  if (SAFE_METHODS.has(normalizedMethod)) return true;
  if (normalizedMethod === 'DELETE') return false;
  return !OPERATOR_BLOCKED_PATHS.some((pattern) => pattern.test(String(pathname || '/')));
}
