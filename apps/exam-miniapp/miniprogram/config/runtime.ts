type EnvVersion = 'develop' | 'trial' | 'release';

type RuntimeProfile = {
    baseUrl: string;
    appName: string;
    companyName: string;
    supportEmail: string;
    privacyPolicyVersion: string;
    userAgreementVersion: string;
};

function getEnvVersion(): EnvVersion {
    try {
        const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
        if (envVersion === 'release' || envVersion === 'trial') {
            return envVersion;
        }
    } catch (error) {
        console.warn('Failed to read mini program envVersion, fallback to develop.', error);
    }

    return 'develop';
}

const sharedProfile: RuntimeProfile = {
    baseUrl: 'https://haxx.pxyb.cn',
    appName: '好爱学习',
    companyName: '请在发布前补充运营主体名称',
    supportEmail: 'support@example.com',
    privacyPolicyVersion: '2026-04-28',
    userAgreementVersion: '2026-04-28',
};

const runtimeProfiles: Record<EnvVersion, RuntimeProfile> = {
    develop: sharedProfile,
    trial: sharedProfile,
    release: sharedProfile,
};

const envVersion = getEnvVersion();

export const runtimeConfig = {
    envVersion,
    ...runtimeProfiles[envVersion],
};
