<template>
    <div class="question-quality-view">
        <div class="content-toolbar admin-list-toolbar-shell">
            <div class="list-metric-strip toolbar-metric-strip">
                <div>
                    <span>扫描 / 总题量</span>
                    <strong>{{ state.summary.scanned }}/{{ state.summary.documents }}</strong>
                </div>
                <div>
                    <span>问题题目</span>
                    <strong>{{ state.summary.problematic }}</strong>
                </div>
                <div>
                    <span>健康题目</span>
                    <strong>{{ state.summary.healthy }}</strong>
                </div>
            </div>
            <div class="question-quality-toolbar">
                <el-select
                    v-if="!consoleMode"
                    v-model="filters.scopeType"
                    class="question-quality-scope"
                    aria-label="题库范围"
                    @change="loadQuality(1)"
                >
                    <el-option label="管理题库" value="admin" />
                    <el-option label="示例题库" value="demo" />
                </el-select>
                <el-select
                    v-model="filters.issue"
                    class="question-quality-issue-filter"
                    placeholder="全部问题类型"
                    clearable
                    aria-label="问题类型"
                    @change="loadQuality(1)"
                >
                    <el-option
                        v-for="item in issueOptions"
                        :key="item.code"
                        :label="item.label"
                        :value="item.code"
                    />
                </el-select>
                <el-button icon="Refresh" :loading="state.loading" @click="loadQuality(state.page)">
                    刷新
                </el-button>
            </div>
        </div>

        <div class="question-quality-summary" aria-label="问题分布">
            <span class="question-quality-summary-label">问题分布</span>
            <el-tag
                v-for="item in visibleIssueSummary"
                :key="item.code"
                size="small"
                effect="plain"
                :type="item.tagType"
            >
                {{ item.label }} {{ item.count }}
            </el-tag>
            <span v-if="visibleIssueSummary.length === 0" class="question-quality-empty-summary">
                当前扫描范围未发现质量问题
            </span>
        </div>

        <el-alert
            v-if="state.summary.truncated"
            type="warning"
            :closable="false"
            show-icon
            class="question-quality-truncated"
        >
            <template #title>
                当前题库共 {{ state.summary.documents }} 道题，本次仅扫描前 {{ state.summary.scanLimit }} 道；结果可能不完整。
            </template>
        </el-alert>

        <el-card shadow="never" class="table-card data-table-card question-quality-card">
            <el-table
                v-loading="state.loading"
                :data="state.list"
                class="full-width-table"
                empty-text="当前筛选下暂无问题题目"
            >
                <el-table-column label="题目" min-width="320" show-overflow-tooltip>
                    <template #default="{ row }">
                        <div class="question-quality-content">
                            <el-tag size="small" :type="getQuestionTypeTag(row.type)" effect="plain">
                                {{ getQuestionTypeName(row.type) }}
                            </el-tag>
                            <span>{{ row.content || '未填写题干' }}</span>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="质量问题" min-width="260">
                    <template #default="{ row }">
                        <div class="question-quality-row-issues">
                            <el-tag
                                v-for="issue in row.issues || []"
                                :key="issue.code"
                                size="small"
                                effect="plain"
                                :type="getSeverityTagType(issue.severity)"
                            >
                                {{ getIssueLabel(issue.code) }}
                            </el-tag>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="版本" width="90" align="center">
                    <template #default="{ row }">v{{ row.revision || 1 }}</template>
                </el-table-column>
                <el-table-column label="更新时间" width="180">
                    <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
                </el-table-column>
                <el-table-column label="操作" width="110" fixed="right">
                    <template #default="{ row }">
                        <el-button size="small" text type="primary" @click="locateQuestion(row)">
                            <el-icon><Location /></el-icon>
                            定位
                        </el-button>
                    </template>
                </el-table-column>
            </el-table>

            <div v-if="state.total > state.limit" class="pagination-container">
                <el-pagination
                    background
                    layout="prev, pager, next"
                    :current-page="state.page"
                    :page-size="state.limit"
                    :total="state.total"
                    @current-change="loadQuality"
                />
            </div>
        </el-card>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import {
    formatDateTime,
    getQuestionTypeName,
    getQuestionTypeTag,
} from '@/features/exam-editor/questionUtils';

const props = defineProps({
    api: { type: Object, required: true },
    consoleMode: { type: Boolean, default: false },
    initialScopeType: { type: String, default: 'admin' },
    initialIssue: { type: String, default: '' },
    initialPage: { type: Number, default: 1 },
    initialLimit: { type: Number, default: 20 },
});

const emit = defineEmits(['open-question']);

const issueOptions = [
    { code: 'missing_analysis', label: '缺少解析', tagType: 'info' },
    { code: 'missing_answer', label: '缺少答案', tagType: 'danger' },
    { code: 'insufficient_options', label: '选项不足', tagType: 'danger' },
    { code: 'duplicate_option_label', label: '选项标签重复', tagType: 'warning' },
    { code: 'empty_option', label: '存在空选项', tagType: 'danger' },
    { code: 'answer_not_in_options', label: '答案不在选项中', tagType: 'danger' },
    { code: 'single_answer_count', label: '单选答案数量异常', tagType: 'danger' },
    { code: 'duplicate_content', label: '重复题干', tagType: 'warning' },
    { code: 'stale_question', label: '长期未更新', tagType: 'warning' },
];

const createIssueCounts = () => Object.fromEntries(issueOptions.map((item) => [item.code, 0]));
const boundedInteger = (value, min, max, fallback) => {
    const number = Number.parseInt(String(value), 10);
    return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};
const initialIssue = issueOptions.some((item) => item.code === props.initialIssue)
    ? props.initialIssue
    : '';
const filters = reactive({
    scopeType: props.consoleMode ? 'personal' : (props.initialScopeType === 'demo' ? 'demo' : 'admin'),
    issue: initialIssue,
});
const state = reactive({
    loading: false,
    list: [],
    page: boundedInteger(props.initialPage, 1, 1000, 1),
    limit: boundedInteger(props.initialLimit, 1, 100, 20),
    total: 0,
    scopeType: filters.scopeType,
    summary: {
        scanned: 0,
        documents: 0,
        problematic: 0,
        healthy: 0,
        issues: createIssueCounts(),
        truncated: false,
        scanLimit: 2000,
        staleDays: 365,
    },
});
let requestController = null;

const visibleIssueSummary = computed(() => issueOptions
    .map((item) => ({
        ...item,
        count: Number(state.summary.issues?.[item.code]) || 0,
    }))
    .filter((item) => item.count > 0));

const getIssueLabel = (code) => issueOptions.find((item) => item.code === code)?.label || code;
const getSeverityTagType = (severity) => ({
    error: 'danger',
    warning: 'warning',
    info: 'info',
}[severity] || 'info');

const loadQuality = async (page = 1) => {
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    state.loading = true;

    const params = {
        page,
        limit: state.limit,
        issue: filters.issue || undefined,
        ...(!props.consoleMode ? { scopeType: filters.scopeType } : {}),
    };

    try {
        const response = await props.api.getQuestionQuality(params, {
            signal: controller.signal,
            showGlobalError: false,
        });
        if (controller.signal.aborted) return;

        const data = response.data?.data || {};
        const summary = data.summary || {};
        state.list = Array.isArray(data.list) ? data.list : [];
        state.page = Number(data.page) || Number(page) || 1;
        state.limit = Number(data.limit) || state.limit;
        state.total = Number(data.total) || 0;
        state.scopeType = data.scopeType || filters.scopeType;
        Object.assign(state.summary, {
            scanned: Number(summary.scanned) || 0,
            documents: Number(summary.documents) || 0,
            problematic: Number(summary.problematic) || 0,
            healthy: Number(summary.healthy) || 0,
            issues: { ...createIssueCounts(), ...(summary.issues || {}) },
            truncated: Boolean(summary.truncated),
            scanLimit: Number(summary.scanLimit) || 2000,
            staleDays: Number(summary.staleDays) || 365,
        });
    } catch (error) {
        if (!controller.signal.aborted) {
            ElMessage.error(error.response?.data?.message || '加载题库质量数据失败');
        }
    } finally {
        if (requestController === controller) {
            state.loading = false;
            requestController = null;
        }
    }
};

const locateQuestion = (row) => {
    if (!row?.categoryId || !row?._id) {
        ElMessage.warning('题目定位信息不完整');
        return;
    }

    emit('open-question', {
        categoryId: String(row.categoryId?._id || row.categoryId),
        questionId: String(row._id),
        scopeType: state.scopeType,
        issue: filters.issue,
        page: state.page,
        limit: state.limit,
    });
};

onMounted(() => loadQuality(state.page));
onBeforeUnmount(() => requestController?.abort());
</script>

<style scoped>
.question-quality-view {
    display: grid;
    gap: 16px;
}

.question-quality-toolbar,
.question-quality-summary,
.question-quality-content,
.question-quality-row-issues {
    display: flex;
    align-items: center;
    gap: 10px;
}

.question-quality-toolbar,
.question-quality-summary,
.question-quality-row-issues {
    flex-wrap: wrap;
}

.question-quality-scope {
    width: 136px;
}

.question-quality-issue-filter {
    width: 210px;
}

.question-quality-summary {
    min-height: 32px;
}

.question-quality-summary-label {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.question-quality-empty-summary {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.question-quality-content {
    min-width: 0;
}

.question-quality-content > span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.question-quality-truncated {
    margin: 0;
}

@media (max-width: 720px) {
    .question-quality-toolbar,
    .question-quality-scope,
    .question-quality-issue-filter {
        width: 100%;
    }

    .question-quality-toolbar :deep(.el-button) {
        width: 100%;
    }
}
</style>
