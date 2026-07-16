import { createRouter, createWebHistory } from 'vue-router';
import { session } from '@/utils/session';
import { notifyAuthExpiredOnce } from '@/utils/authFailure';
import { applyUiPreviewQuery, ensureUiPreviewSession } from '@/utils/uiPreview';
import { APP_BASE_PATH } from '@/utils/runtime';

const routes = [
    {
        path: '/login',
        name: 'Login',
        component: () => import('@/views/LoginView.vue'),
        meta: { guest: true },
    },
    {
        path: '/',
        name: 'Dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { requiresAuth: true },
    },
    {
        path: '/exam-detail',
        name: 'ExamDetail',
        component: () => import('@/views/ExamDetailView.vue'),
        meta: { requiresAuth: true },
    },
    {
        path: '/:pathMatch(.*)*',
        redirect: '/',
    },
];

const router = createRouter({
    history: createWebHistory(APP_BASE_PATH || '/'),
    routes,
    scrollBehavior(to, from, savedPosition) {
        if (to.name === 'Dashboard' && from.name === 'ExamDetail') {
            return { left: 0, top: 0 };
        }

        return savedPosition || { left: 0, top: 0 };
    },
});

router.beforeEach((to) => {
    if (applyUiPreviewQuery(to.query)) {
        ensureUiPreviewSession(session);
    }

    const sessionStatus = session.getStatus();

    if (to.meta.requiresAuth && !sessionStatus.active) {
        if (sessionStatus.expired) notifyAuthExpiredOnce();

        const query = {};
        if (to.query.shareCode) query.shareCode = to.query.shareCode;
        return { path: '/login', query };
    }

    if (to.meta.guest && sessionStatus.active) {
        return { path: '/' };
    }
});

export default router;
