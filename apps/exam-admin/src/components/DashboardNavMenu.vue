<template>
    <el-menu :default-active="activeMenu" @select="$emit('select', $event)">
        <el-menu-item index="dashboard">
            <el-icon><DataLine /></el-icon>
            <span>数据概览</span>
        </el-menu-item>
        <el-menu-item index="major-categories">
            <el-icon><Folder /></el-icon>
            <span>{{ manageMenuLabel }}</span>
        </el-menu-item>
        <el-menu-item v-if="!consoleMode" index="demo-manage">
            <el-icon><Collection /></el-icon>
            <span>示例题库管理</span>
        </el-menu-item>
        <el-menu-item v-if="!consoleMode" index="exam-results">
            <el-icon><Trophy /></el-icon>
            <span>考试记录</span>
        </el-menu-item>
        <el-menu-item v-if="!consoleMode" index="users">
            <el-icon><User /></el-icon>
            <span>考生管理</span>
        </el-menu-item>
        <el-menu-item v-if="!consoleMode" index="personal-categories">
            <el-icon><Files /></el-icon>
            <span>个人题库监管</span>
        </el-menu-item>
        <el-menu-item index="feedbacks" class="feedback-menu-item">
            <el-icon><ChatDotRound /></el-icon>
            <span>{{ feedbackMenuLabel }}</span>
            <span v-if="feedbackBadgeCount > 0" class="nav-badge">{{ formattedBadgeCount }}</span>
        </el-menu-item>
    </el-menu>
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

const formattedBadgeCount = computed(() => (
    props.feedbackBadgeCount > 99 ? '99+' : String(props.feedbackBadgeCount)
));
</script>
