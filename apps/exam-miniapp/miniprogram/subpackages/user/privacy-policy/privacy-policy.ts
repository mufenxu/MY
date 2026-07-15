import { runtimeConfig } from '../../../config/runtime';
import { getNavBarInfo } from '../../../utils/nav';

Page({
    data: {
        appName: runtimeConfig.appName,
        companyName: runtimeConfig.companyName,
        supportEmail: runtimeConfig.supportEmail,
        version: runtimeConfig.privacyPolicyVersion,
        sections: [
            {
                title: '我们收集的信息',
                paragraphs: [
                    '为了提供登录、考试记录同步和错题本功能，我们会收集你的微信 OpenID。',
                    '当你主动填写昵称时，我们会保存昵称信息；头像文件默认仅保存在当前设备本地。',
                    '在你使用考试、做题、错题本和进度恢复功能时，我们会保存考试成绩、答题记录与学习进度。',
                ],
            },
            {
                title: '信息使用目的',
                paragraphs: [
                    '用于识别你的账号身份，并在不同设备间同步学习记录。',
                    '用于展示你的历史成绩、错题内容、最近进度和学习统计。',
                    '用于后台运营分析、题库维护与异常问题排查。',
                ],
            },
            {
                title: '信息保存与保护',
                paragraphs: [
                    '我们会通过鉴权、限流、访问控制等措施保护你的数据安全。',
                    '考试结果会保存题目快照，避免因题库变更影响你的历史记录展示。',
                    '你可以通过“账号与数据”页面退出登录，或注销账号并删除相关学习数据。',
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
