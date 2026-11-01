<template>
    <el-config-provider :locale="zhCn">
        <router-view v-slot="{ Component, route }">
            <transition name="page-fade" mode="out-in" appear>
                <component :is="Component" :key="route.name || route.fullPath" />
            </transition>
        </router-view>
    </el-config-provider>
</template>

<script setup>
import zhCn from 'element-plus/es/locale/lang/zh-cn';
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
