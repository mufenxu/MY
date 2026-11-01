<template>
    <nav class="rail-nav" aria-label="管理模块">
        <div v-for="group in groups" :key="group.label" class="rail-group">
            <div class="rail-group-label">{{ group.label }}</div>
            <button
                v-for="item in group.items"
                :key="item.key"
                type="button"
                class="rail-item"
                :class="{ 'is-active': activeMenu === item.key }"
                :title="item.label"
                :aria-current="activeMenu === item.key ? 'page' : undefined"
                @click="$emit('select', item.key)"
            >
                <el-icon class="rail-item-icon"><component :is="item.icon" /></el-icon>
                <span class="rail-item-label">{{ item.label }}</span>
                <span v-if="item.key === 'feedbacks' && feedbackBadgeCount > 0" class="rail-item-badge">
                    {{ formattedBadgeCount }}
                </span>
            </button>
        </div>
    </nav>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    activeMenu: { type: String, required: true },
    consoleMode: { type: Boolean, default: false },
    manageMenuLabel: { type: String, required: true },
    feedbackMenuLabel: { type: String, required: true },
    feedbackBadgeCount: { type: Number, default: 0 },
});

defineEmits(['select']);

const groups = computed(() => {
    const nav = [];

    nav.push({
        label: '工作台',
        items: [{ key: 'dashboard', icon: 'DataLine', label: '数据概览' }],
    });

    const content = [
        { key: 'major-categories', icon: 'Folder', label: props.manageMenuLabel },
    ];
    if (!props.consoleMode) {
        content.push({ key: 'demo-manage', icon: 'Collection', label: '示例题库管理' });
    }
    content.push({ key: 'question-quality', icon: 'DataAnalysis', label: '题库质量' });
    nav.push({ label: '内容', items: content });

    if (!props.consoleMode) {
        nav.push({
            label: '运营',
            items: [
                { key: 'exam-results', icon: 'Trophy', label: '考试记录' },
                { key: 'users', icon: 'User', label: '考生管理' },
                { key: 'learning-plans', icon: 'TrendCharts', label: '学习计划' },
                { key: 'personal-categories', icon: 'Files', label: '个人题库监管' },
            ],
        });
    }

    nav.push({
        label: '服务',
        items: [{ key: 'feedbacks', icon: 'ChatDotRound', label: props.feedbackMenuLabel }],
    });

    return nav;
});

const formattedBadgeCount = computed(() => (
    props.feedbackBadgeCount > 99 ? '99+' : String(props.feedbackBadgeCount)
));
</script>
