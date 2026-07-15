export const AUTH_REQUIRED_ERROR_CODE = 'AUTH_REQUIRED';

export function buildQuery(params: Record<string, string | number | undefined>) {
    const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
    if (entries.length === 0) return '';
    const query = entries
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
    return `?${query}`;
}

export function createAuthRequiredError() {
    const error = new Error('请先登录后再继续操作') as Error & { code: string };
    error.code = AUTH_REQUIRED_ERROR_CODE;
    return error;
}
