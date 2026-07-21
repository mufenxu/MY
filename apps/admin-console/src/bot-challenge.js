const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken({
  token,
  secretKey,
  remoteIp = '',
  expectedHostname = '',
  expectedAction = 'platform_login',
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  if (!secretKey) return { valid: false, reason: 'not_configured' };
  if (!token || String(token).length > 4096) return { valid: false, reason: 'missing_token' };
  const body = new URLSearchParams({
    secret: secretKey,
    response: String(token),
    ...(remoteIp ? { remoteip: String(remoteIp) } : {}),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) return { valid: false, reason: 'upstream_error' };
    const result = await response.json().catch(() => ({}));
    if (!result.success) return { valid: false, reason: 'challenge_failed', codes: result['error-codes'] || [] };
    if (expectedHostname && result.hostname !== expectedHostname) return { valid: false, reason: 'hostname_mismatch' };
    if (expectedAction && result.action !== expectedAction) return { valid: false, reason: 'action_mismatch' };
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: error?.name === 'AbortError' ? 'timeout' : 'request_failed' };
  } finally {
    clearTimeout(timer);
  }
}
