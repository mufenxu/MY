import { api, LearningPlan } from '../../../services/api';
import { buildPageUrl, promptLogin } from '../../../utils/auth';
import { getNavBarInfo } from '../../../utils/nav';
import { ROUTES } from '../../../utils/routes';

type LearningPlanView = LearningPlan & {
    dueText: string;
    dueHint: string;
    stateText: string;
    stateClass: string;
    progressPercent: number;
    completedCategoryCount: number;
    totalCategoryCount: number;
    categories: Array<LearningPlan['categoryIds'][number] & {
        bestScore: number;
        completed: boolean;
    }>;
};

Page({
    data: {
        plans: [] as LearningPlanView[],
        loading: true,
        loadedOnce: false,
        summary: {
            activeCount: 0,
            completedCount: 0,
            overdueCount: 0,
        },
        navBarHeight: 0,
        menuButtonTop: 0,
        menuButtonHeight: 0,
    },

    async onLoad() {
        const navInfo = getNavBarInfo();
        this.setData({
            navBarHeight: navInfo.navBarHeight,
            menuButtonTop: navInfo.menuButtonTop,
            menuButtonHeight: navInfo.menuButtonHeight,
        });

        if (!api.isLoggedIn()) {
            await promptLogin({
                message: '登录后才能查看学习计划，是否前往登录？',
                nextUrl: buildPageUrl(ROUTES.LEARNING_PLANS),
            });
            this.setData({ loading: false, loadedOnce: true });
            return;
        }
        this.loadPlans();
    },

    onShow() {
        if (this.data.loadedOnce && api.isLoggedIn()) {
            this.loadPlans();
        }
    },

    async onPullDownRefresh() {
        await this.loadPlans();
        wx.stopPullDownRefresh();
    },

    async loadPlans() {
        this.setData({ loading: true });
        try {
            const plans = await api.getLearningPlans();
            const viewPlans = plans.map((plan) => this.toViewPlan(plan));
            this.setData({
                plans: viewPlans,
                summary: {
                    activeCount: viewPlans.filter((plan) => plan.progress.state === 'active').length,
                    completedCount: viewPlans.filter((plan) => plan.progress.state === 'completed').length,
                    overdueCount: viewPlans.filter((plan) => plan.progress.state === 'overdue').length,
                },
            });
        } catch (error) {
            console.error('Load learning plans failed', error);
            wx.showToast({ title: '学习计划加载失败', icon: 'none' });
        } finally {
            this.setData({ loading: false, loadedOnce: true });
        }
    },

    toViewPlan(plan: LearningPlan): LearningPlanView {
        const userProgress = plan.progress && plan.progress.users && plan.progress.users[0];
        const categoryProgress = new Map(
            ((userProgress && userProgress.categories) || []).map((item) => [String(item.categoryId), item]),
        );
        const due = this.formatDue(plan.dueAt);
        const state = (plan.progress && plan.progress.state) || 'active';
        return {
            ...plan,
            dueText: due.text,
            dueHint: due.hint,
            stateText: { active: '进行中', completed: '已完成', overdue: '已逾期', archived: '已归档' }[state],
            stateClass: state,
            progressPercent: (userProgress && userProgress.progressPercent) || 0,
            completedCategoryCount: (userProgress && userProgress.completedCategoryCount) || 0,
            totalCategoryCount: (userProgress && userProgress.totalCategoryCount) || plan.categoryIds.length,
            categories: plan.categoryIds.map((category) => {
                const progress = categoryProgress.get(String(category._id));
                return {
                    ...category,
                    bestScore: (progress && progress.bestScore) || 0,
                    completed: Boolean(progress && progress.completed),
                };
            }),
        };
    },

    formatDue(value?: string | null) {
        if (!value) return { text: '长期有效', hint: '无截止时间' };
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return { text: '未设置', hint: '' };
        const text = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        const remaining = date.getTime() - Date.now();
        if (remaining < 0) return { text, hint: '已超过截止时间' };
        const days = Math.ceil(remaining / 86400000);
        return { text, hint: days <= 1 ? '今天截止' : `剩余 ${days} 天` };
    },

    onStartCategory(event: WechatMiniprogram.TouchEvent) {
        const categoryId = String(event.currentTarget.dataset.categoryId || '');
        const planId = String(event.currentTarget.dataset.planId || '');
        const plan = this.data.plans.find((item) => item._id === planId);
        const category = plan && plan.categories.find((item) => item._id === categoryId);
        if (!category) return;
        wx.navigateTo({
            url: buildPageUrl(ROUTES.EXAM, {
                categoryId: category._id,
                title: category.name,
                duration: category.duration || 0,
                mode: 'exam',
                sourceType: 'demo',
            }),
        });
    },

    onBack() {
        wx.navigateBack();
    },
});
