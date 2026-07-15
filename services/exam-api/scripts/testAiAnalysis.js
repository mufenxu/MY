const { generateQuestionAnalysis } = require('../src/services/aiAnalysisService');

async function main() {
    const result = await generateQuestionAnalysis({
        question: {
            type: 'single',
            content: '小程序中用于发起网络请求的 API 是？',
            options: [
                { label: 'A', value: 'wx.navigateTo' },
                { label: 'B', value: 'wx.request' },
                { label: 'C', value: 'wx.showToast' },
            ],
            answer: ['B'],
            analysis: 'wx.request 用于发起 HTTPS 网络请求。',
        },
        userAnswer: ['A'],
    });

    console.log(JSON.stringify({
        model: result.model,
        createdAt: result.createdAt,
        persisted: result.persisted,
        stored: result.stored,
        generated: result.generated,
        analysis: result.analysis,
    }, null, 2));
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
