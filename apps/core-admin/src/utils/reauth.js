import { fetchWithTimeout, IS_PLATFORM_SSO } from './runtime';

export async function establishSensitiveSession({ password, totp = '' }) {
  if (!password) throw new Error('请输入当前管理员密码');
  if (!IS_PLATFORM_SSO) return { currentPassword: password };

  const response = await fetchWithTimeout('/api/auth/reauth', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Platform-Request': 'console',
    },
    body: JSON.stringify({ password, totp }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || '统一管理账号二次验证失败');
  }
  return {};
}
