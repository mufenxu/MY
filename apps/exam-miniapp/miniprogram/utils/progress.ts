export type ProgressLike = {
    mode?: string;
    currentIndex?: number | string;
    answers?: unknown;
    reciteMastery?: Record<string, unknown> | null;
    reciteQueue?: unknown;
    questionCount?: number | string;
    isCleared?: boolean;
};

export function hasAnsweredValue(answers: unknown): boolean {
    if (!answers || typeof answers !== 'object') {
        return false;
    }

    return Object.values(answers as Record<string, unknown>).some((answer) => {
        if (Array.isArray(answer)) {
            return answer.length > 0;
        }

        return answer !== undefined && answer !== null && answer !== '';
    });
}

export function hasUsefulProgress(progress?: ProgressLike | null): boolean {
    if (!progress || progress.isCleared) {
        return false;
    }

    if (progress.mode === 'recite') {
        if (progress.reciteMastery && Object.keys(progress.reciteMastery).length > 0) {
            return true;
        }

        const questionCount = Number(progress.questionCount) || 0;
        return Array.isArray(progress.reciteQueue)
            && questionCount > 0
            && progress.reciteQueue.length < questionCount;
    }

    return Number(progress.currentIndex) > 0 || hasAnsweredValue(progress.answers);
}
