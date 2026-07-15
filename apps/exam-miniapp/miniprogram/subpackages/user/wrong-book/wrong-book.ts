import { api } from '../../../services/api';
import { buildPageUrl, promptLogin } from '../../../utils/auth';
import { getNavBarInfo } from '../../../utils/nav';

Page({
    data: {
        wrongCategories: [] as any[],
        totalWrongCount: 0,
        loading: true,
        navBarHeight: 0,
        menuButtonTop: 0,
        menuButtonHeight: 0,
        gradients: [
            '#4e8df5',
            '#34c759',
            '#af52de',
            '#ff9500',
            '#ff3b30',
            '#5856d6',
        ],
    },

    onLoad() {
        this.initNavBar();
    },

    async onShow() {
        if (!api.isLoggedIn()) {
            await promptLogin({
                message: '登录后可查看并同步错题本，是否前往登录？',
            });
            this.setData({ loading: false, wrongCategories: [], totalWrongCount: 0 });
            return;
        }

        this.loadWrongQuestions();
    },

    initNavBar() {
        const navInfo = getNavBarInfo();
        this.setData({
            navBarHeight: navInfo.navBarHeight,
            menuButtonTop: navInfo.menuButtonTop,
            menuButtonHeight: navInfo.menuButtonHeight,
        });
    },

    async loadWrongQuestions() {
        this.setData({ loading: true });
        try {
            const [categories, wrongCategories] = await Promise.all([
                api.getMyCategories(),
                api.getWrongQuestions(),
            ]);

            const validCategoryIds = new Set<string>(categories.map((category) => category._id));
            const filteredWrongCategories = wrongCategories.filter((item: any) =>
                validCategoryIds.has(item.categoryId)
            );

            const totalWrongCount = filteredWrongCategories.reduce(
                (sum: number, category: any) => sum + category.questions.length,
                0
            );

            this.setData({
                wrongCategories: filteredWrongCategories,
                totalWrongCount,
            });
        } catch (error) {
            console.error('Load wrong questions failed', error);
        } finally {
            this.setData({ loading: false });
        }
    },

    onBack() {
        wx.navigateBack();
    },

    onCategoryTap(e: WechatMiniprogram.TouchEvent) {
        const { categoryId, categoryName, count } = e.currentTarget.dataset;

        wx.navigateTo({
            url: buildPageUrl('/subpackages/user/wrong-practice/wrong-practice', {
                categoryId,
                title: categoryName,
                count,
            }),
        });
    },
});
