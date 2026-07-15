<template>
    <el-config-provider :locale="zhCn">
        <router-view v-slot="{ Component, route }">
            <transition
                name="page-fade"
                mode="out-in"
                appear
                @before-leave="handlePageBeforeLeave"
                @after-leave="handlePageAfterLeave"
            >
                <component :is="Component" :key="route.name || route.fullPath" />
            </transition>
        </router-view>
    </el-config-provider>
</template>

<script setup>
import zhCn from 'element-plus/es/locale/lang/zh-cn';

const EXAM_DETAIL_BODY_CLASS = 'exam-detail-active';

const isExamDetailPageElement = (element) => {
    if (!element) return false;
    return element.classList?.contains('exam-detail-page')
        || Boolean(element.querySelector?.('.exam-detail-page'));
};

const handlePageBeforeLeave = (element) => {
    if (isExamDetailPageElement(element) && typeof document !== 'undefined') {
        document.body.classList.add(EXAM_DETAIL_BODY_CLASS);
    }
};

const handlePageAfterLeave = (element) => {
    if (
        isExamDetailPageElement(element)
        && typeof document !== 'undefined'
        && !document.querySelector('.exam-detail-page')
    ) {
        document.body.classList.remove(EXAM_DETAIL_BODY_CLASS);
    }
};
</script>

<style>
.page-fade-enter-active,
.page-fade-leave-active {
    transition:
        opacity 0.24s ease,
        transform 0.24s ease,
        filter 0.24s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
    opacity: 0;
    transform: translateY(8px);
    filter: saturate(0.92);
}

@media (prefers-reduced-motion: reduce) {
    .page-fade-enter-active,
    .page-fade-leave-active {
        transition: none;
    }

    .page-fade-enter-from,
    .page-fade-leave-to {
        opacity: 1;
        transform: none;
        filter: none;
    }
}
</style>
