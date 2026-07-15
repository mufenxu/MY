import { ElMessage } from 'element-plus';

const AUTH_EXPIRED_MESSAGE = '登录失效，请重新登录';

let authExpiredNotified = false;

export function notifyAuthExpiredOnce() {
    if (authExpiredNotified) return false;

    authExpiredNotified = true;
    ElMessage.closeAll();
    ElMessage.error({
        message: AUTH_EXPIRED_MESSAGE,
        grouping: true,
    });
    return true;
}

export function resetAuthExpiredNotice() {
    authExpiredNotified = false;
}
