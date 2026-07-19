import complianceProfiles = require('./compliance-profile');

type EnvVersion = 'develop' | 'trial' | 'release';

type RuntimeProfile = {
    baseUrl: string;
    consoleBaseUrl: string;
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
    baseUrl: 'https://pxyb.cn/api/exam/client',
    consoleBaseUrl: 'https://pxyb.cn/apps/exam',
    appName: '好爱学习',
    companyName: '开发环境运营主体（不可发布）',
    supportEmail: 'dev-only@example.invalid',
    privacyPolicyVersion: '2026-04-28',
    userAgreementVersion: '2026-04-28',
};

const runtimeProfiles: Record<EnvVersion, RuntimeProfile> = {
    develop: sharedProfile,
    trial: { ...sharedProfile, ...complianceProfiles.trial },
    release: { ...sharedProfile, ...complianceProfiles.release },
};

const envVersion = getEnvVersion();
const selectedProfile = runtimeProfiles[envVersion];

function assertDistributionCompliance(profile: RuntimeProfile, version: EnvVersion) {
    const companyName = String(profile.companyName || '').trim();
    const supportEmail = String(profile.supportEmail || '').trim();
    const invalidCompany = !companyName
        || companyName.indexOf('__REQUIRED_') === 0
        || companyName.indexOf('不可发布') >= 0
        || companyName.indexOf('请在发布前') >= 0;
    const invalidEmail = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)
        || supportEmail.indexOf('__REQUIRED_') === 0
        || /@(example\.(com|invalid)|localhost)$/i.test(supportEmail);

    if (invalidCompany || invalidEmail) {
        throw new Error(`${version} 版本缺少真实运营主体或支持邮箱，已阻止启动`);
    }
}

if (envVersion !== 'develop') {
    assertDistributionCompliance(selectedProfile, envVersion);
}

export const runtimeConfig = {
    envVersion,
    ...selectedProfile,
};
