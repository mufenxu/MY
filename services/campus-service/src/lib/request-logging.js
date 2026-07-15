const ROUTINE_REQUEST_PATHS = new Set([
  "/api/ready",
  "/api/health",
  "/api/app-auth/status",
  "/api/identity-card/code",
  "/api/academic/evaluations/auto"
]);
const ROUTINE_CLIENT_ERROR_CODES = new Set(["ECONNRESET", "EPIPE"]);

export const ROUTINE_REQUEST_SLOW_MS = 5_000;

export function shouldLogRequestCompleted({ path, status, durationMs }) {
  if (!ROUTINE_REQUEST_PATHS.has(path)) return true;
  if (status < 200 || status >= 300) return true;
  return Number(durationMs) >= ROUTINE_REQUEST_SLOW_MS;
}

export function shouldLogClientError(error) {
  return !ROUTINE_CLIENT_ERROR_CODES.has(error?.code);
}
