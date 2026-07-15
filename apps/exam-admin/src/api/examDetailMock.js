const clone = (value) => JSON.parse(JSON.stringify(value));

const ok = (data, message = '操作成功') => Promise.resolve({
    data: {
        code: 0,
        message,
        data: clone(data),
    },
});

let mockExamInfo = {
    _id: 'exam-public-2026',
    name: '公共基础综合能力模拟卷 2026',
    duration: 60,
    passingScore: 72,
    readOnly: false,
};

let mockQuestions = [
    {
        _id: 'q-001',
        type: 'single',
        content: '管理后台中用于快速判断试卷质量趋势的指标是？',
        options: [
            { label: 'A', value: '近 7 天做题趋势' },
            { label: 'B', value: '浏览器窗口宽度' },
            { label: 'C', value: '按钮圆角大小' },
            { label: 'D', value: '登录页背景颜色' },
        ],
        answer: ['A'],
        analysis: '趋势数据可以帮助管理员快速判断试卷使用热度和学习活跃度。',
        analysisSource: 'manual',
    },
    {
        _id: 'q-002',
        type: 'multiple',
        content: '一份成熟的题库后台通常需要关注哪些体验？',
        options: [
            { label: 'A', value: '长标题和空状态的展示' },
            { label: 'B', value: '表格筛选与批量操作反馈' },
            { label: 'C', value: '所有按钮都使用同一种颜色' },
            { label: 'D', value: '移动端关键流程可用' },
        ],
        answer: ['A', 'B', 'D'],
        analysis: '管理后台需要兼顾信息密度、可读性、可维护性和响应式体验。',
        analysisSource: 'ai',
    },
    {
        _id: 'q-003',
        type: 'judge',
        content: '题目编辑页的左右栏固定后，中间题目列表应保持可滚动。',
        options: [
            { label: 'A', value: '正确' },
            { label: 'B', value: '错误' },
        ],
        answer: ['A'],
        analysis: '工作台式布局应让导航、编辑区和属性区各自保持清晰的滚动边界。',
        analysisSource: 'manual',
    },
    {
        _id: 'q-004',
        type: 'fill',
        content: '后台视觉验收无法连接远程数据库时，可以使用前端 ____ 数据模式。',
        options: [],
        answer: ['Mock'],
        analysis: 'Mock 数据模式可以稳定复现典型页面状态，便于本地检查布局。',
        analysisSource: 'manual',
    },
    {
        _id: 'q-005',
        type: 'single',
        content: '当反馈数量较多时，最优先优化的区域是？',
        options: [
            { label: 'A', value: '列表筛选、状态标签和处理入口' },
            { label: 'B', value: '登录页二维码阴影' },
            { label: 'C', value: '页面背景装饰' },
            { label: 'D', value: '首页品牌名称' },
        ],
        answer: ['A'],
        analysis: '反馈管理是高频工作流，筛选和处理路径会直接影响效率。',
        analysisSource: 'manual',
    },
    {
        _id: 'q-006',
        type: 'multiple',
        content: '题目卡片中哪些内容需要避免溢出？',
        options: [
            { label: 'A', value: '题干内容' },
            { label: 'B', value: '选项文本' },
            { label: 'C', value: '解析内容' },
            { label: 'D', value: '题号导航' },
        ],
        answer: ['A', 'B', 'C', 'D'],
        analysis: '题库内容天然存在长文本，所有展示容器都需要稳定尺寸和换行策略。',
        analysisSource: 'ai',
    },
];

export function createMockExamDetailApi() {
    return {
        loadExamInfo: () => ok(mockExamInfo),
        listQuestions: () => ok({
            list: mockQuestions,
            total: mockQuestions.length,
        }),
        getAiAnalysis: (questionId) => {
            const question = mockQuestions.find((item) => item._id === questionId) || mockQuestions[0];
            return ok({
                questionId: question._id,
                content: question.analysis || '这是一段用于预览弹窗排版的 AI 解析内容。',
                adopted: question.analysisSource === 'ai',
                updateTime: new Date().toISOString(),
            });
        },
        generateAiAnalyses: (payload = {}) => ok({
            generated: payload.questionIds?.length || 0,
            failed: 0,
            failures: [],
        }, '预览模式已生成 AI 解析'),
        adoptAiAnalysis: () => ok(null, '预览模式已采纳解析'),
        deleteAiAnalysis: () => ok(null, '预览模式已删除解析'),
        updateExamInfo: (payload) => {
            mockExamInfo = { ...mockExamInfo, ...payload };
            return ok(mockExamInfo, '预览模式已更新试卷信息');
        },
        saveQuestions: (questions) => {
            mockQuestions = (questions || []).map((question, index) => ({
                _id: question._id || `q-preview-${index + 1}`,
                type: question.type,
                content: question.content,
                options: question.options || [],
                answer: question.answer || [],
                analysis: question.analysis || '',
                analysisSource: question.analysisSource || 'manual',
            }));
            return ok({ list: mockQuestions, total: mockQuestions.length }, '预览模式已保存题目');
        },
    };
}
