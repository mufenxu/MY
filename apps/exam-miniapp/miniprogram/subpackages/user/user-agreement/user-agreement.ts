import { runtimeConfig } from '../../../config/runtime';
import { getNavBarInfo } from '../../../utils/nav';

Page({
    data: {
        appName: runtimeConfig.appName,
        companyName: runtimeConfig.companyName,
        supportEmail: runtimeConfig.supportEmail,
        version: runtimeConfig.userAgreementVersion,
        sections: [
            {
                title: '服务说明',
                paragraphs: [
                    `${runtimeConfig.appName} 提供题库学习、模拟考试、错题复习和成绩记录服务。`,
                    '你应确保在使用过程中提交的信息真实、合法，不得利用服务从事违规活动。',
                ],
            },
            {
                title: '账号与内容使用',
                paragraphs: [
                    '你的账号以微信身份标识为基础建立，请妥善保管当前设备和登录状态。',
                    '题库内容、页面设计和后台管理能力仅限学习与授权运营使用，未经允许不得批量抓取、转载或售卖。',
                ],
            },
            {
                title: '服务变更与终止',
                paragraphs: [
                    '为了维护系统安全或升级服务，我们可能对题库、页面、功能和访问策略进行调整。',
                    '你可以随时在“账号与数据”页面退出登录，或申请注销账号并删除学习数据。',
                    `如对协议有疑问，可联系：${runtimeConfig.supportEmail}。`,
                ],
            },
        ],
        navBarHeight: 0,
        menuButtonTop: 0,
        menuButtonHeight: 0,
    },

    onLoad() {
        const navInfo = getNavBarInfo();
        this.setData({
            navBarHeight: navInfo.navBarHeight,
            menuButtonTop: navInfo.menuButtonTop,
            menuButtonHeight: navInfo.menuButtonHeight,
        });
    },
});
