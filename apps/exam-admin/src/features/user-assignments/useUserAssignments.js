import { computed, reactive } from 'vue';
import { ElMessage } from 'element-plus';

function readFlag(source) {
    if (source && typeof source === 'object' && 'value' in source) return Boolean(source.value);
    return Boolean(source);
}

/**
 * 考生题库分配域：按科目分组展示可分配试卷，保存分配后刷新考生列表。
 *
 * `loadUsers` 由调用方注入（保存成功后需要刷新考生列表，该函数属于用户 CRUD 域）。
 */
export function useUserAssignments({
    adminApi,
    isConsoleMode,
    loadUsers = async () => {},
    message = ElMessage,
} = {}) {
    const userAssignmentDialog = reactive({
        visible: false,
        loading: false,
        saving: false,
        user: null,
        filterMajorIds: [],
        form: {
            majorCategoryIds: [],
            categoryIds: [],
        },
        options: {
            majorCategories: [],
            categories: [],
        },
    });

    const groupedAssignmentCategories = computed(() => {
        const groups = {};
        const majorMap = {};
        (userAssignmentDialog.options.majorCategories || []).forEach((item) => {
            majorMap[item._id] = item;
        });

        const filterSet = new Set(userAssignmentDialog.filterMajorIds || []);

        (userAssignmentDialog.options.categories || []).forEach((item) => {
            const majorId = item.majorCategoryId?._id || item.majorCategoryId || '';

            if (filterSet.size > 0 && !filterSet.has(String(majorId))) {
                return;
            }

            const groupKey = majorId ? String(majorId) : 'ungrouped';
            if (!groups[groupKey]) {
                groups[groupKey] = {
                    id: groupKey,
                    name: majorId ? (majorMap[groupKey]?.name || '未命名科目') : '未分组试卷',
                    sortOrder: majorId ? (majorMap[groupKey]?.sortOrder || 0) : 999999,
                    items: [],
                };
            }
            groups[groupKey].items.push(item);
        });

        return Object.values(groups)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN'))
            .map((group) => ({
                ...group,
                items: group.items.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
            }));
    });

    const assignmentDialogStats = computed(() => {
        const selectedIds = new Set(userAssignmentDialog.form.categoryIds || []);
        const visibleCount = groupedAssignmentCategories.value
            .reduce((sum, group) => sum + group.items.length, 0);

        return {
            selectedCount: selectedIds.size,
            visibleCount,
        };
    });

    const openUserAssignmentDialog = async (user) => {
        if (readFlag(isConsoleMode)) {
            return;
        }
        userAssignmentDialog.visible = true;
        userAssignmentDialog.loading = true;
        userAssignmentDialog.user = user;
        userAssignmentDialog.filterMajorIds = [];
        userAssignmentDialog.form.majorCategoryIds = [];
        userAssignmentDialog.form.categoryIds = [];
        userAssignmentDialog.options.majorCategories = [];
        userAssignmentDialog.options.categories = [];

        try {
            const res = await adminApi.getUserAssignments(user.openid);
            if (res.data.code === 0) {
                const data = res.data.data || {};
                const majorIds = (data.assignment?.majorCategoryIds || []).map(String);
                const catIds = new Set((data.assignment?.categoryIds || []).map(String));

                if (majorIds.length > 0) {
                    const majorIdSet = new Set(majorIds);
                    (data.availableCategories || []).forEach(cat => {
                        const catMajorId = cat.majorCategoryId?._id || cat.majorCategoryId || '';
                        if (majorIdSet.has(String(catMajorId))) {
                            catIds.add(String(cat._id));
                        }
                    });
                }

                userAssignmentDialog.form.majorCategoryIds = [];
                userAssignmentDialog.form.categoryIds = Array.from(catIds);
                userAssignmentDialog.options.majorCategories = data.availableMajorCategories || [];
                userAssignmentDialog.options.categories = data.availableCategories || [];
            }
        } catch (err) {
            message.error('加载分配数据失败');
            userAssignmentDialog.visible = false;
        } finally {
            userAssignmentDialog.loading = false;
        }
    };

    const saveUserAssignments = async () => {
        if (readFlag(isConsoleMode) || !userAssignmentDialog.user?.openid) {
            return;
        }

        try {
            userAssignmentDialog.saving = true;
            const res = await adminApi.saveUserAssignments(userAssignmentDialog.user.openid, {
                majorCategoryIds: [],
                categoryIds: userAssignmentDialog.form.categoryIds,
            });
            if (res.data.code === 0) {
                message.success('分配保存成功');
                userAssignmentDialog.visible = false;
                loadUsers();
            }
        } catch (err) {
            message.error(err.response?.data?.message || '分配保存失败');
        } finally {
            userAssignmentDialog.saving = false;
        }
    };

    return {
        userAssignmentDialog,
        groupedAssignmentCategories,
        assignmentDialogStats,
        openUserAssignmentDialog,
        saveUserAssignments,
    };
}
