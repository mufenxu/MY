const now = Date.now();
const dayMs = 24 * 60 * 60 * 1000;

const isoDaysAgo = (days, hourOffset = 0) => new Date(now - days * dayMs + hourOffset * 60 * 60 * 1000).toISOString();

const clone = (value) => JSON.parse(JSON.stringify(value));

const ok = (data, message = '操作成功') => Promise.resolve({
    data: {
        code: 0,
        message,
        data: clone(data),
    },
});

const paginate = (list, { page = 1, pageSize, limit } = {}) => {
    const size = Number(pageSize || limit || 20);
    const current = Number(page || 1);
    const start = (current - 1) * size;
    return {
        list: list.slice(start, start + size),
        total: list.length,
        page: current,
        limit: size,
    };
};

const includesKeyword = (values, keyword) => {
    const text = String(keyword || '').trim().toLowerCase();
    if (!text) return true;
    return values.some((value) => String(value || '').toLowerCase().includes(text));
};

const majorCategories = [
    { _id: 'major-public', name: '公共基础题库', sortOrder: 10, showOnHome: true },
    { _id: 'major-medical', name: '医学三基训练', sortOrder: 20, showOnHome: true },
    { _id: 'major-safety', name: '安全生产考试', sortOrder: 30, showOnHome: true },
    { _id: 'major-archive', name: '历史归档题库', sortOrder: 90, showOnHome: false },
];

const categories = [
    {
        _id: 'exam-public-2026',
        majorCategoryId: 'major-public',
        name: '公共基础综合能力模拟卷 2026',
        description: '覆盖常识、判断、资料分析等基础能力模块。',
        count: 128,
        duration: 60,
        passingScore: 72,
        isPublished: true,
        createTime: isoDaysAgo(36),
        updateTime: isoDaysAgo(1),
    },
    {
        _id: 'exam-writing-long-title',
        majorCategoryId: 'major-public',
        name: '行政职业能力测验长标题压力测试试卷',
        description: '用于检查卡片长标题、长说明和按钮组合的视觉表现。',
        count: 86,
        duration: 45,
        passingScore: 60,
        isPublished: true,
        createTime: isoDaysAgo(24),
        updateTime: isoDaysAgo(2),
    },
    {
        _id: 'exam-medical-basic',
        majorCategoryId: 'major-medical',
        name: '护理三基理论强化训练',
        description: '护理核心制度、院感防控、急救流程。',
        count: 240,
        duration: 90,
        passingScore: 80,
        isPublished: true,
        createTime: isoDaysAgo(18),
        updateTime: isoDaysAgo(0, -4),
    },
    {
        _id: 'exam-medical-hidden',
        majorCategoryId: 'major-medical',
        name: '药学基础知识内部复盘卷',
        description: '暂未发布，适合检查隐藏态。',
        count: 54,
        duration: 35,
        passingScore: 70,
        isPublished: false,
        createTime: isoDaysAgo(12),
        updateTime: isoDaysAgo(5),
    },
    {
        _id: 'exam-safety',
        majorCategoryId: 'major-safety',
        name: '安全生产标准化考试',
        description: '安全责任、隐患排查、事故应急。',
        count: 168,
        duration: 75,
        passingScore: 75,
        isPublished: true,
        createTime: isoDaysAgo(10),
        updateTime: isoDaysAgo(0, -2),
    },
    {
        _id: 'exam-archive',
        majorCategoryId: 'major-archive',
        name: '2024 年旧版制度归档卷',
        description: '归档资料，只保留查询。',
        count: 38,
        duration: 30,
        passingScore: 60,
        isPublished: false,
        createTime: isoDaysAgo(160),
        updateTime: isoDaysAgo(80),
    },
];

const users = [
    {
        openid: 'mock-openid-001',
        studyId: 'HX260184',
        nickname: '林小满',
        avatarUrl: '',
        createTime: isoDaysAgo(0, -7),
        lastActiveTime: isoDaysAgo(0, -1),
        examCount: 18,
        assignedMajorCategoryCount: 2,
        assignedCategoryCount: 5,
    },
    {
        openid: 'mock-openid-002',
        studyId: 'HX260235',
        nickname: '陈一舟',
        avatarUrl: '',
        createTime: isoDaysAgo(1),
        lastActiveTime: isoDaysAgo(0, -3),
        examCount: 11,
        assignedMajorCategoryCount: 1,
        assignedCategoryCount: 3,
    },
    {
        openid: 'mock-openid-003',
        studyId: 'HX260319',
        nickname: '未命名考生',
        avatarUrl: '',
        createTime: isoDaysAgo(3),
        lastActiveTime: isoDaysAgo(2),
        examCount: 3,
        assignedMajorCategoryCount: 0,
        assignedCategoryCount: 1,
    },
    {
        openid: 'mock-openid-004',
        studyId: 'HX260421',
        nickname: '赵明远',
        avatarUrl: '',
        createTime: isoDaysAgo(8),
        lastActiveTime: isoDaysAgo(4),
        examCount: 27,
        assignedMajorCategoryCount: 3,
        assignedCategoryCount: 7,
    },
];

const examResults = [
    ['mock-result-001', 0, '林小满', 'mock-openid-001', 'HX260184', 'exam-medical-basic', 94, 47, 50],
    ['mock-result-002', 0, '陈一舟', 'mock-openid-002', 'HX260235', 'exam-public-2026', 76, 38, 50],
    ['mock-result-003', 1, '赵明远', 'mock-openid-004', 'HX260421', 'exam-safety', 58, 29, 50],
    ['mock-result-004', 2, '林小满', 'mock-openid-001', 'HX260184', 'exam-public-2026', 88, 44, 50],
    ['mock-result-005', 4, '未命名考生', 'mock-openid-003', 'HX260319', 'exam-writing-long-title', 62, 31, 50],
    ['mock-result-006', 6, '赵明远', 'mock-openid-004', 'HX260421', 'exam-medical-basic', 91, 46, 50],
].map(([id, days, nickname, openid, studyId, categoryId, score, correctCount, totalCount]) => {
    const category = categories.find((item) => item._id === categoryId) || {};
    return {
        _id: id,
        createTime: isoDaysAgo(days, -2),
        nickname,
        openid,
        studyId,
        categoryId,
        categoryName: category.name,
        score,
        correctCount,
        totalCount,
    };
});

const feedbacks = [
    {
        _id: 'feedback-001',
        category: 'content',
        status: 'open',
        title: '护理三基第 18 题答案疑似有误',
        content: '题干中描述的是无菌操作场景，但正确答案与解析不一致，建议老师复核。',
        ownerStudyId: 'HX260184',
        user: users[0],
        createTime: isoDaysAgo(0, -5),
        updateTime: isoDaysAgo(0, -4),
    },
    {
        _id: 'feedback-002',
        category: 'feature',
        status: 'replied',
        title: '希望考试记录可以导出 Excel',
        content: '班级复盘时需要按试卷导出成绩，希望后台支持筛选后导出。',
        replyContent: '已记录，会在后续版本评估。',
        repliedAt: isoDaysAgo(1, -3),
        ownerStudyId: 'HX260235',
        user: users[1],
        createTime: isoDaysAgo(2),
        updateTime: isoDaysAgo(1, -3),
    },
    {
        _id: 'feedback-003',
        category: 'bug',
        status: 'closed',
        title: '移动端查看解析时偶现遮挡',
        content: '小屏幕查看解析内容时，底部按钮会遮住最后一行文字。',
        replyContent: '已修复并关闭。',
        repliedAt: isoDaysAgo(5),
        ownerStudyId: 'HX260421',
        user: users[3],
        createTime: isoDaysAgo(6),
        updateTime: isoDaysAgo(5),
    },
];

const personalCategories = [
    {
        _id: 'personal-001',
        name: '林小满的护士资格错题本',
        sourceType: 'owned',
        sourceLabel: '用户创建',
        owner: users[0],
        majorCategory: { name: '护理复习' },
        isPublished: true,
        count: 42,
        createTime: isoDaysAgo(14),
        updateTime: isoDaysAgo(1),
    },
    {
        _id: 'personal-002',
        name: '陈一舟接收的公共基础冲刺卷',
        sourceType: 'shared',
        sourceLabel: '来自分享',
        owner: users[1],
        majorCategory: { name: '公共基础' },
        isPublished: true,
        count: 86,
        createTime: isoDaysAgo(8),
        updateTime: isoDaysAgo(2),
    },
    {
        _id: 'personal-003',
        name: '赵明远安全生产练习集',
        sourceType: 'owned',
        sourceLabel: '用户创建',
        owner: users[3],
        majorCategory: { name: '安全生产' },
        isPublished: false,
        count: 29,
        createTime: isoDaysAgo(20),
        updateTime: isoDaysAgo(6),
    },
];

const personalQuestions = [
    { _id: 'pq-001', type: 'single', content: '无菌操作前最先需要完成的步骤是？', answer: ['A'], analysis: '应先进行手卫生并准备无菌环境。' },
    { _id: 'pq-002', type: 'multiple', content: '安全生产隐患排查应覆盖哪些环节？', answer: ['A', 'C'], analysis: '隐患排查应覆盖制度、现场和人员行为。' },
    { _id: 'pq-003', type: 'judge', content: '考试发布后仍可继续调整及格分。', answer: ['B'], analysis: '发布后调整会影响统计口径，应谨慎处理。' },
    { _id: 'pq-004', type: 'fill', content: '成人胸外按压频率建议为每分钟 ____ 次。', answer: ['100-120'], analysis: '常用建议频率为 100-120 次/分。' },
];

const paperShares = [
    {
        _id: 'share-001',
        shareCode: 'HAOAI26A',
        shareCodeText: 'HAOA-I26A',
        permission: 'view',
        expiresAt: isoDaysAgo(-7),
        state: 'active',
        acceptedCount: 12,
        maxAcceptCount: 100,
    },
    {
        _id: 'share-002',
        shareCode: 'HAOAI26B',
        shareCodeText: 'HAOA-I26B',
        permission: 'edit',
        expiresAt: isoDaysAgo(-30),
        state: 'active',
        acceptedCount: 4,
        maxAcceptCount: 20,
    },
];

function getTrendLabels() {
    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(now - (6 - index) * dayMs);
        return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
}

function filterExamResults(params = {}) {
    return examResults.filter((item) => (
        (!params.categoryId || item.categoryId === params.categoryId)
        && (!params.userId || item.openid === params.userId)
    ));
}

function filterUsers(params = {}) {
    return users.filter((item) => includesKeyword([
        item.nickname,
        item.studyId,
        item.openid,
    ], params.keyword));
}

function filterPersonalCategories(params = {}) {
    return personalCategories.filter((item) => {
        const statusMatch = params.publishStatus === 'hidden'
            ? item.isPublished === false
            : params.publishStatus === 'published'
                ? item.isPublished !== false
                : true;
        const sourceMatch = params.source && params.source !== 'all'
            ? item.sourceType === params.source
            : true;
        const ownerMatch = params.ownerStudyId
            ? String(item.owner?.studyId || '').includes(String(params.ownerStudyId))
            : true;
        return statusMatch && sourceMatch && ownerMatch && includesKeyword([
            item.name,
            item.owner?.nickname,
            item.owner?.studyId,
            item.majorCategory?.name,
        ], params.keyword);
    });
}

function filterFeedbacks(params = {}) {
    return feedbacks.filter((item) => (
        (!params.status || item.status === params.status)
        && includesKeyword([
            item.title,
            item.content,
            item.user?.nickname,
            item.user?.studyId,
            item.ownerStudyId,
        ], params.keyword)
    ));
}

export function createMockAdminApi() {
    return {
        getDashboardData: () => ok({
            counts: {
                majorCategories: majorCategories.length,
                categories: categories.length,
                questions: categories.reduce((sum, item) => sum + Number(item.count || 0), 0),
                examResults: examResults.length,
                publishedCategories: categories.filter((item) => item.isPublished !== false).length,
                practiceRecords: examResults.length + 21,
            },
            chartData: {
                dates: getTrendLabels(),
                values: [16, 22, 18, 35, 29, 41, 27],
            },
        }),
        listMajorCategories: () => ok(majorCategories),
        listCategories: () => ok(categories),
        saveMajorCategory: () => ok(null, '预览模式不会保存科目'),
        deleteMajorCategory: () => ok(null, '预览模式不会删除科目'),
        saveCategory: () => ok(null, '预览模式不会保存试卷'),
        deleteCategory: () => ok(null, '预览模式不会删除试卷'),
        listPaperShares: () => ok(paperShares),
        createPaperShare: () => ok({
            ...paperShares[0],
            shareCode: 'PREVIEW1',
            shareCodeText: 'PREV-IEW1',
            shareUrl: `${window.location.origin}/?shareCode=PREVIEW1`,
        }, '预览分享码已生成'),
        revokePaperShare: () => ok(null, '预览分享已撤销'),
        previewPaperShare: () => ok({
            share: {
                shareCode: 'PREVIEW1',
                shareCodeText: 'PREV-IEW1',
                permission: 'view',
                expiresAt: isoDaysAgo(-12),
            },
            sourceCategory: categories[0],
            alreadyAccepted: false,
            importedCategory: null,
        }),
        acceptPaperShare: () => ok({
            created: true,
            category: categories[0],
            importedCategory: categories[0],
        }, '预览分享已接收'),
        getCategoryAnalysis: () => ok({
            summary: {
                totalAttempts: 128,
                averageScore: 78,
                passRate: 82,
                averageAccuracy: 76,
            },
            trendData: {
                dates: Array.from({ length: 14 }, (_, index) => {
                    const date = new Date(now - (13 - index) * dayMs);
                    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                }),
                attempts: [4, 8, 5, 12, 9, 14, 18, 10, 16, 20, 17, 22, 19, 24],
                averageScores: [72, 76, 68, 81, 77, 79, 84, 73, 82, 86, 78, 88, 83, 85],
            },
            typeStats: [
                { typeName: '单选', accuracy: 78, wrong: 42, total: 190 },
                { typeName: '多选', accuracy: 64, wrong: 58, total: 160 },
                { typeName: '判断', accuracy: 86, wrong: 18, total: 130 },
                { typeName: '填空', accuracy: 59, wrong: 31, total: 76 },
            ],
            weakQuestions: personalQuestions.map((item, index) => ({
                ...item,
                typeName: ['单选', '多选', '判断', '填空'][index],
                wrongRate: [42, 38, 31, 48][index],
                wrong: [18, 16, 9, 21][index],
                total: [43, 42, 29, 44][index],
            })),
        }),
        listExamResults: (params) => ok(paginate(filterExamResults(params), params)),
        deleteExamResults: () => ok(null, '预览模式不会删除考试记录'),
        listUsers: (params) => ok(paginate(filterUsers(params), params)),
        getUserDetails: (openid) => {
            const user = users.find((item) => item.openid === openid) || users[0];
            return ok({
                user,
                stats: {
                    totalExams: user.examCount,
                    avgScore: 82,
                    highestScore: 98,
                    passRate: 88,
                },
                trendData: {
                    labels: ['第1次', '第2次', '第3次', '第4次', '第5次', '第6次', '第7次'],
                    scores: [68, 74, 79, 81, 88, 85, 92],
                },
                history: examResults.filter((item) => item.openid === user.openid),
            });
        },
        deleteUsers: () => ok(null, '预览模式不会删除考生'),
        clearUserRecords: () => ok(null, '预览模式不会清空记录'),
        getUserAssignments: () => ok({
            assignment: {
                majorCategoryIds: ['major-public'],
                categoryIds: ['exam-public-2026'],
            },
            availableMajorCategories: majorCategories,
            availableCategories: categories,
        }),
        saveUserAssignments: () => ok(null, '预览模式不会保存分配'),
        listPersonalCategories: (params) => ok(paginate(filterPersonalCategories(params), params)),
        getPersonalCategory: (id) => ok({
            category: personalCategories.find((item) => item._id === id) || personalCategories[0],
            stats: {
                questionCount: 42,
                practiceCount: 31,
            },
        }),
        listPersonalCategoryQuestions: (id, params) => ok({
            ...paginate(personalQuestions, params),
            category: personalCategories.find((item) => item._id === id) || personalCategories[0],
        }),
        getFeedbackSummary: () => ok({
            pendingCount: feedbacks.filter((item) => item.status === 'open').length,
            unreadReplyCount: feedbacks.filter((item) => item.status === 'replied').length,
        }),
        listFeedbacks: (params) => ok(paginate(filterFeedbacks(params), params)),
        createFeedback: () => ok(null, '预览模式不会提交反馈'),
        replyFeedback: () => ok(null, '预览模式不会保存回复'),
        updateFeedbackStatus: () => ok(null, '预览模式不会关闭反馈'),
        markFeedbackReplyRead: () => ok({ replyReadAt: new Date().toISOString() }),
        getProfile: () => ok({
            id: 'ui-preview-admin',
            username: 'ui-preview',
            displayName: 'UI 预览管理员',
            role: 'admin',
            isWechatBound: true,
        }),
        logout: () => ok(null),
        bindWechat: () => ok(null),
        unbindWechat: () => ok(null),
        changePassword: () => ok(null, '预览模式不会修改密码'),
    };
}
