import { Question } from '../../services/types';

type AnalysisSegment = {
    id: string;
    text: string;
    bold: boolean;
};

function parseAnalysisSegments(value: string): AnalysisSegment[] {
    const text = String(value || '');
    const segments: AnalysisSegment[] = [];
    const pattern = /(\*\*\*|\*\*)([\s\S]+?)\1/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            segments.push({
                id: `${segments.length}`,
                text: text.slice(lastIndex, match.index),
                bold: false,
            });
        }

        segments.push({
            id: `${segments.length}`,
            text: match[2],
            bold: true,
        });
        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
        segments.push({
            id: `${segments.length}`,
            text: text.slice(lastIndex),
            bold: false,
        });
    }

    return segments.length > 0 ? segments : [{ id: '0', text, bold: false }];
}

Component({
    properties: {
        question: {
            type: Object,
        },
        showAnalysis: {
            type: Boolean,
            value: false,
        },
        userAnswer: {
            type: Array,
            value: [],
        },
        canUseAiAnalysis: {
            type: Boolean,
            value: false,
        },
        canGenerateAiAnalysis: {
            type: Boolean,
            value: false,
        },
        aiAnalysis: {
            type: String,
            value: '',
        },
        aiAnalysisLoading: {
            type: Boolean,
            value: false,
        }
    },

    data: {
        selectedValues: [] as string[],
        analysisSegments: parseAnalysisSegments('暂无解析'),
        aiAnalysisSegments: [] as AnalysisSegment[],
        hasCurrentAiAnalysis: false,
    },

    observers: {
        'question, userAnswer': function (_question, userAnswer) {
            // 当题目切换或传入用户答案时，更新选择状态
            if (userAnswer && userAnswer.length > 0) {
                this.setData({ selectedValues: userAnswer });
            } else {
                this.setData({ selectedValues: [] });
            }
        },
        'question, aiAnalysis': function (question, aiAnalysis) {
            const currentQuestion = question as Question | undefined;
            const questionAnalysis = currentQuestion && currentQuestion.analysis ? currentQuestion.analysis : '';
            const generatedAiText = aiAnalysis || (currentQuestion && currentQuestion.aiAnalysis) || '';
            const isAdoptedAiAnalysis = Boolean(currentQuestion && currentQuestion.analysisSource === 'ai');
            const analysis = isAdoptedAiAnalysis && generatedAiText
                ? generatedAiText
                : (questionAnalysis || '暂无解析');
            const aiText = isAdoptedAiAnalysis ? '' : generatedAiText;
            const hasCurrentAiAnalysis = Boolean(
                generatedAiText || (isAdoptedAiAnalysis && questionAnalysis),
            );

            this.setData({
                analysisSegments: parseAnalysisSegments(analysis),
                aiAnalysisSegments: aiText ? parseAnalysisSegments(aiText) : [],
                hasCurrentAiAnalysis,
            });
        }
    },

    methods: {
        onOptionTap(e: WechatMiniprogram.TouchEvent) {
            if (this.data.showAnalysis) return; // 如果已经显示解析（已提交），则不可修改

            const { value } = e.currentTarget.dataset;
            const question = this.data.question as unknown as Question;
            if (!question) return;
            const { type } = question;
            let { selectedValues } = this.data;

            if (type === 'single' || type === 'judge') {
                selectedValues = [value];
            } else if (type === 'multiple') {
                const index = selectedValues.indexOf(value);
                if (index > -1) {
                    selectedValues.splice(index, 1);
                } else {
                    selectedValues.push(value);
                }
            }

            this.setData({ selectedValues });
            this.triggerEvent('change', { value: selectedValues });
        },

        onFillInput(e: any) {
            const { value } = e.detail;
            this.setData({ selectedValues: [value] });
            this.triggerEvent('change', { value: [value] });
        },

        onAiAnalysisTap() {
            if (this.data.aiAnalysisLoading) {
                return;
            }

            const question = this.data.question as unknown as Question;
            const adoptedAiAnalysis = question && question.analysisSource === 'ai' ? question.analysis : '';
            const existingAiAnalysis = this.data.aiAnalysis || (question && question.aiAnalysis) || adoptedAiAnalysis || '';

            this.triggerEvent('ai-analysis', {
                question,
                forceRefresh: Boolean(this.data.canGenerateAiAnalysis && existingAiAnalysis),
            });
        },

        // 供外部调用，判断是否正确
        isCorrect() {
            const { selectedValues } = this.data;
            const { answer } = this.data.question as unknown as Question;
            if (selectedValues.length !== answer.length) return false;
            return selectedValues.every(v => answer.includes(v));
        }
    }
});
