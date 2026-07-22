<template>
    <el-dialog
        v-model="dialogVisible"
        :title="`第 ${questionNumber || '-'} 题版本记录`"
        width="900px"
        class="question-version-dialog"
        append-to-body
        @closed="handleDialogClosed"
    >
        <el-alert
            v-if="!canEdit"
            title="当前题库为只读，版本记录可查看但不能回滚。"
            type="info"
            :closable="false"
            show-icon
            class="question-version-readonly"
        />

        <el-table
            v-loading="history.loading"
            :data="history.list"
            max-height="440"
            empty-text="暂无版本记录"
        >
            <el-table-column label="版本" width="105">
                <template #default="{ row }">
                    <div class="question-version-number">
                        <strong>v{{ row.revision }}</strong>
                        <el-tag v-if="isCurrentRevision(row)" size="small" type="success" effect="plain">
                            当前
                        </el-tag>
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="动作" width="100">
                <template #default="{ row }">
                    <el-tag size="small" :type="getActionTagType(row.action)" effect="plain">
                        {{ getActionLabel(row.action) }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="变更字段" min-width="220">
                <template #default="{ row }">
                    <div v-if="row.changedFields?.length" class="question-version-fields">
                        <el-tag
                            v-for="field in row.changedFields"
                            :key="field"
                            size="small"
                            effect="plain"
                        >
                            {{ getFieldLabel(field) }}
                        </el-tag>
                    </div>
                    <span v-else class="question-version-muted">基线记录</span>
                </template>
            </el-table-column>
            <el-table-column label="操作人" min-width="130" show-overflow-tooltip>
                <template #default="{ row }">{{ formatActor(row) }}</template>
            </el-table-column>
            <el-table-column label="记录时间" width="170">
                <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                    <el-button size="small" text type="primary" @click="openVersionDetail(row)">
                        详情
                    </el-button>
                    <el-button
                        size="small"
                        text
                        type="warning"
                        :loading="restoringRevision === Number(row.revision)"
                        :disabled="!canRestore(row)"
                        @click="restoreVersion(row)"
                    >
                        回滚
                    </el-button>
                </template>
            </el-table-column>
            <template #empty>
                <span>{{ history.historyStarted ? '暂无版本记录' : '首次修改后将开始记录题目版本' }}</span>
            </template>
        </el-table>

        <div v-if="history.total > history.limit" class="question-version-pagination">
            <el-pagination
                background
                layout="prev, pager, next"
                :current-page="history.page"
                :page-size="history.limit"
                :total="history.total"
                @current-change="loadVersionHistory"
            />
        </div>
    </el-dialog>

    <el-dialog
        v-model="detail.visible"
        :title="detail.record ? `版本 v${detail.record.revision} 详情` : '版本详情'"
        width="720px"
        class="question-version-detail-dialog"
        append-to-body
    >
        <div v-loading="detail.loading" class="question-version-detail">
            <template v-if="detail.record">
                <el-descriptions :column="detailColumnCount" border>
                    <el-descriptions-item label="版本">v{{ detail.record.revision }}</el-descriptions-item>
                    <el-descriptions-item label="动作">
                        {{ getActionLabel(detail.record.action) }}
                    </el-descriptions-item>
                    <el-descriptions-item label="操作人">{{ formatActor(detail.record) }}</el-descriptions-item>
                    <el-descriptions-item label="记录时间">
                        {{ formatDateTime(detail.record.createTime) }}
                    </el-descriptions-item>
                    <el-descriptions-item label="来源版本">
                        {{ detail.record.sourceRevision ? `v${detail.record.sourceRevision}` : '--' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="题型">
                        {{ getQuestionTypeName(detail.record.snapshot?.type) }}
                    </el-descriptions-item>
                    <el-descriptions-item label="变更字段" :span="2">
                        <div v-if="detail.record.changedFields?.length" class="question-version-fields">
                            <el-tag
                                v-for="field in detail.record.changedFields"
                                :key="field"
                                size="small"
                                effect="plain"
                            >
                                {{ getFieldLabel(field) }}
                            </el-tag>
                        </div>
                        <span v-else>基线记录</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="题干" :span="2">
                        <div class="question-version-content">{{ detail.record.snapshot?.content || '--' }}</div>
                    </el-descriptions-item>
                    <el-descriptions-item label="选项" :span="2">
                        <div v-if="detail.record.snapshot?.options?.length" class="question-version-options">
                            <div v-for="option in detail.record.snapshot.options" :key="option.label">
                                <strong>{{ option.label }}</strong>
                                <span>{{ option.value }}</span>
                            </div>
                        </div>
                        <span v-else>无选项</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="答案" :span="2">
                        {{ formatSnapshotAnswer(detail.record.snapshot) }}
                    </el-descriptions-item>
                    <el-descriptions-item label="解析" :span="2">
                        <div class="question-version-content">{{ detail.record.snapshot?.analysis || '无解析' }}</div>
                    </el-descriptions-item>
                </el-descriptions>
            </template>
        </div>

        <template #footer>
            <span class="dialog-footer">
                <el-button @click="detail.visible = false">关闭</el-button>
                <el-button
                    v-if="detail.record"
                    type="warning"
                    :loading="restoringRevision === Number(detail.record.revision)"
                    :disabled="!canRestore(detail.record)"
                    @click="restoreVersion(detail.record)"
                >
                    回滚到此版本
                </el-button>
            </span>
        </template>
    </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatDateTime, getQuestionTypeName } from '@/features/exam-editor/questionUtils';

const props = defineProps({
    visible: { type: Boolean, default: false },
    api: { type: Object, required: true },
    canEdit: { type: Boolean, default: false },
    dirty: { type: Boolean, default: false },
    question: { type: Object, default: null },
    questionNumber: { type: Number, default: 0 },
});

const emit = defineEmits(['update:visible', 'restored']);

const dialogVisible = computed({
    get: () => props.visible,
    set: (value) => emit('update:visible', value),
});

const history = reactive({
    loading: false,
    list: [],
    total: 0,
    page: 1,
    limit: 20,
    currentRevision: 1,
    historyStarted: false,
});
const detail = reactive({
    visible: false,
    loading: false,
    record: null,
});
const restoringRevision = ref(0);
const detailColumnCount = ref(2);
let historyController = null;
let detailController = null;
let restoreController = null;

const fieldLabels = {
    type: '题型',
    content: '题干',
    options: '选项',
    answer: '答案',
    analysis: '解析',
    analysisSource: '解析来源',
    categoryId: '所属题库',
    sortOrder: '排序',
};

const actionLabels = {
    create: '创建',
    baseline: '基线',
    update: '更新',
    rollback: '回滚',
};

const actionTagTypes = {
    create: 'success',
    baseline: 'info',
    update: 'primary',
    rollback: 'warning',
};

const questionId = computed(() => String(props.question?._id || ''));
const getFieldLabel = (field) => fieldLabels[field] || field;
const getActionLabel = (action) => actionLabels[action] || action || '未知';
const getActionTagType = (action) => actionTagTypes[action] || 'info';
const isCurrentRevision = (record) => (
    Number(record?.revision) === Number(history.currentRevision)
);
const canRestore = (record) => (
    props.canEdit
    && Boolean(record?.revision)
    && !isCurrentRevision(record)
    && restoringRevision.value === 0
);
const formatActor = (record) => (
    record?.actorName
    || record?.actorId
    || ({ admin: '管理员', console: '题库用户', system: '系统' }[record?.actorType])
    || '系统'
);
const formatSnapshotAnswer = (snapshot) => {
    const answer = Array.isArray(snapshot?.answer) ? snapshot.answer : [];
    return answer.length > 0 ? answer.join('、') : '未设置';
};

const loadVersionHistory = async (page = 1) => {
    if (!questionId.value) return;

    historyController?.abort();
    const controller = new AbortController();
    historyController = controller;
    history.loading = true;

    try {
        const response = await props.api.listQuestionVersions(
            questionId.value,
            { page, limit: history.limit },
            { signal: controller.signal, showGlobalError: false },
        );
        if (controller.signal.aborted) return;

        const data = response.data?.data || {};
        history.list = Array.isArray(data.list) ? data.list : [];
        history.total = Number(data.total) || 0;
        history.page = Number(data.page) || Number(page) || 1;
        history.limit = Number(data.limit) || history.limit;
        history.currentRevision = Number(data.currentRevision) || Number(props.question?.revision) || 1;
        history.historyStarted = Boolean(data.historyStarted || history.total > 0);
    } catch (error) {
        if (!controller.signal.aborted) {
            ElMessage.error(error.response?.data?.message || '加载版本记录失败');
        }
    } finally {
        if (historyController === controller) {
            history.loading = false;
            historyController = null;
        }
    }
};

const openVersionDetail = async (record) => {
    if (!questionId.value || !record?.revision) return;

    detailController?.abort();
    const controller = new AbortController();
    detailController = controller;
    detail.record = null;
    detail.visible = true;
    detail.loading = true;

    try {
        const response = await props.api.getQuestionVersion(
            questionId.value,
            record.revision,
            { signal: controller.signal, showGlobalError: false },
        );
        if (!controller.signal.aborted) {
            detail.record = response.data?.data || null;
        }
    } catch (error) {
        if (!controller.signal.aborted) {
            ElMessage.error(error.response?.data?.message || '加载版本详情失败');
            detail.visible = false;
        }
    } finally {
        if (detailController === controller) {
            detail.loading = false;
            detailController = null;
        }
    }
};

const restoreVersion = async (record) => {
    if (props.dirty) {
        ElMessage.warning('当前有未保存修改，请先保存后再回滚版本');
        return;
    }
    if (!canRestore(record) || !questionId.value) return;

    try {
        await ElMessageBox.confirm(
            `确定回滚到版本 v${record.revision}？系统会保留当前版本，并创建一条新的回滚记录。`,
            '确认回滚版本',
            {
                confirmButtonText: '确认回滚',
                cancelButtonText: '取消',
                type: 'warning',
            },
        );
    } catch {
        return;
    }

    restoreController?.abort();
    const controller = new AbortController();
    restoreController = controller;
    restoringRevision.value = Number(record.revision);

    try {
        const response = await props.api.restoreQuestionVersion(
            questionId.value,
            record.revision,
            { signal: controller.signal, showGlobalError: false },
        );
        if (controller.signal.aborted) return;

        ElMessage.success(response.data?.message || `已回滚到版本 v${record.revision}`);
        detail.visible = false;
        emit('restored', {
            questionId: questionId.value,
            question: response.data?.data || null,
        });
        await loadVersionHistory(1);
    } catch (error) {
        if (!controller.signal.aborted) {
            ElMessage.error(error.response?.data?.message || '回滚版本失败');
        }
    } finally {
        if (restoreController === controller) {
            restoringRevision.value = 0;
            restoreController = null;
        }
    }
};

const handleDialogClosed = () => {
    historyController?.abort();
    detailController?.abort();
    detail.visible = false;
};

watch(() => props.visible, (visible) => {
    if (visible) loadVersionHistory(1);
});

watch(questionId, (value, previous) => {
    if (props.visible && value && value !== previous) loadVersionHistory(1);
});

const updateDetailColumnCount = () => {
    detailColumnCount.value = typeof window !== 'undefined' && window.innerWidth <= 640 ? 1 : 2;
};

onMounted(() => {
    updateDetailColumnCount();
    window.addEventListener('resize', updateDetailColumnCount);
});

onBeforeUnmount(() => {
    historyController?.abort();
    detailController?.abort();
    restoreController?.abort();
    window.removeEventListener('resize', updateDetailColumnCount);
});
</script>

<style scoped>
:global(.question-version-dialog),
:global(.question-version-detail-dialog) {
    max-width: calc(100vw - 32px);
}

.question-version-readonly {
    margin-bottom: 16px;
}

.question-version-number,
.question-version-fields {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.question-version-number strong {
    font-variant-numeric: tabular-nums;
}

.question-version-muted {
    color: var(--el-text-color-secondary);
}

.question-version-pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
}

.question-version-detail {
    min-height: 120px;
}

.question-version-content {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.7;
}

.question-version-options {
    display: grid;
    gap: 8px;
}

.question-version-options > div {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
}

.question-version-options span {
    overflow-wrap: anywhere;
}

@media (max-width: 640px) {
    .question-version-pagination {
        justify-content: center;
        overflow-x: auto;
    }
}
</style>
