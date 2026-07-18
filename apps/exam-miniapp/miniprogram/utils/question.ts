/**
 * 题目处理工具函数
 * 提供题目分组等通用逻辑
 */

export interface QuestionItem {
    _id: string;
    type: 'single' | 'multiple' | 'judge' | 'fill';
    content: string;
    options: { label: string; value: string }[];
    answer: string[];
    analysis?: string;
}

export interface GroupedQuestion {
    type: string;
    typeName: string;
    items: { questionId: string; originalIndex: number }[];
}

export function groupQuestionsByType(questions: QuestionItem[]): GroupedQuestion[] {
    const typeOrder = ['single', 'multiple', 'judge', 'fill'];
    const typeNames: Record<string, string> = {
        single: '单选题',
        multiple: '多选题',
        judge: '判断题',
        fill: '填空题',
    };

    const groups: Record<string, { questionId: string; originalIndex: number }[]> = {};

    questions.forEach((question, index) => {
        const type = question.type;
        if (!groups[type]) {
            groups[type] = [];
        }
        groups[type].push({ questionId: question._id, originalIndex: index });
    });

    return typeOrder
        .filter((type) => groups[type] && groups[type].length > 0)
        .map((type) => ({
            type,
            typeName: typeNames[type] || type,
            items: groups[type],
        }));
}
