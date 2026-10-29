import { reactive } from 'vue';
import { ElMessage } from 'element-plus';

function readFlag(source) {
    if (source && typeof source === 'object' && 'value' in source) return Boolean(source.value);
    return Boolean(source);
}

export function usePasswordDialog({
    adminApi,
    isConsoleMode,
    isPlatformSso = false,
    onChanged = () => {},
    message = ElMessage,
} = {}) {
    const passwordDialog = reactive({
        visible: false,
        loading: false,
    });
    const passwordForm = reactive({
        oldPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    const openPasswordDialog = () => {
        if (readFlag(isConsoleMode)) {
            message.info('个人题库身份不使用账号密码登录');
            return;
        }
        passwordForm.oldPassword = '';
        passwordForm.newPassword = '';
        passwordForm.confirmPassword = '';
        passwordDialog.visible = true;
    };

    const submitChangePassword = async () => {
        if (readFlag(isConsoleMode)) return;
        if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            message.warning('请填写完整信息');
            return;
        }
        if (passwordForm.newPassword.length < 12) {
            message.warning('新密码长度不能少于 12 位');
            return;
        }
        if (!/[a-z]/.test(passwordForm.newPassword)
            || !/[A-Z]/.test(passwordForm.newPassword)
            || !/\d/.test(passwordForm.newPassword)
            || !/[^A-Za-z0-9]/.test(passwordForm.newPassword)) {
            message.warning('新密码需包含大小写字母、数字和特殊符号');
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            message.warning('两次输入的新密码不一致');
            return;
        }

        try {
            passwordDialog.loading = true;
            const res = await adminApi.changePassword({
                oldPassword: passwordForm.oldPassword,
                newPassword: passwordForm.newPassword,
            });
            if (res.data.code === 0) {
                message.success(isPlatformSso ? '考试后台独立密码已修改' : '密码修改成功，请重新登录');
                passwordDialog.visible = false;
                if (isPlatformSso) return;
                onChanged();
            }
        } catch (err) {
            message.error(err.response?.data?.message || '修改密码失败');
        } finally {
            passwordDialog.loading = false;
        }
    };

    return {
        passwordDialog,
        passwordForm,
        openPasswordDialog,
        submitChangePassword,
    };
}
