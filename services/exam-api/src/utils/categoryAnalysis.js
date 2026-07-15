function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function round(value) {
    return Math.round(toNumber(value));
}

function toDayLabel(date) {
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) {
        return '';
    }

    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${month}-${day}`;
}

function buildRecentDayLabels(dayCount = 14) {
    const labels = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (dayCount - 1));

    for (let index = 0; index < dayCount; index += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        labels.push(toDayLabel(date));
    }

    return labels;
}

function getPassingScore(result, category) {
    return toNumber(result.categorySnapshot?.passingScore, toNumber(category.passingScore, 60));
}

function getQuestionTypeName(type) {
    const map = {
        single: '单选',
        multiple: '多选',
        judge: '判断',
        fill: '填空',
    };
    return map[type] || type || '未知';
}

function getDetailQuestionId(detail) {
    return String(detail?.questionId || detail?.question?._id || '');
}

function getDetailContent(detail) {
    return String(detail?.content || detail?.question?.content || '');
}

function getDetailType(detail) {
    return String(detail?.type || detail?.question?.type || '');
}

function hasUserAnswer(detail) {
    const answer = detail?.userAnswer;
    return Array.isArray(answer) ? answer.length > 0 : answer !== undefined && answer !== null && answer !== '';
}

async function buildCategoryAnalysis({ ExamResult, category, query, dayCount = 14, maxResults = 5000 }) {
    const results = await ExamResult.find(query)
        .select('score correctCount totalCount details createTime categorySnapshot')
        .sort({ createTime: -1 })
        .limit(maxResults)
        .lean();

    const totalAttempts = results.length;
    const scoreSum = results.reduce((sum, item) => sum + toNumber(item.score), 0);
    const averageScore = totalAttempts > 0 ? round(scoreSum / totalAttempts) : 0;
    const highestScore = totalAttempts > 0
        ? Math.max(...results.map((item) => toNumber(item.score)))
        : 0;
    const lowestScore = totalAttempts > 0
        ? Math.min(...results.map((item) => toNumber(item.score)))
        : 0;
    const passCount = results.filter((item) => toNumber(item.score) >= getPassingScore(item, category)).length;
    const answeredTotal = results.reduce((sum, item) => sum + toNumber(item.totalCount), 0);
    const correctTotal = results.reduce((sum, item) => sum + toNumber(item.correctCount), 0);
    const averageAccuracy = answeredTotal > 0 ? Math.round((correctTotal / answeredTotal) * 100) : 0;

    const labels = buildRecentDayLabels(dayCount);
    const trendMap = new Map(labels.map((label) => [label, { attempts: 0, scoreSum: 0 }]));
    const questionMap = new Map();
    const typeMap = new Map();

    for (const result of results) {
        const label = toDayLabel(result.createTime);
        if (trendMap.has(label)) {
            const bucket = trendMap.get(label);
            bucket.attempts += 1;
            bucket.scoreSum += toNumber(result.score);
        }

        for (const detail of result.details || []) {
            const type = getDetailType(detail);
            const typeName = getQuestionTypeName(type);
            if (!typeMap.has(typeName)) {
                typeMap.set(typeName, {
                    type,
                    typeName,
                    total: 0,
                    correct: 0,
                    wrong: 0,
                });
            }

            const typeStats = typeMap.get(typeName);
            typeStats.total += 1;
            if (detail.isCorrect) {
                typeStats.correct += 1;
            } else if (hasUserAnswer(detail)) {
                typeStats.wrong += 1;
            }

            const questionId = getDetailQuestionId(detail);
            if (!questionId) {
                continue;
            }

            if (!questionMap.has(questionId)) {
                questionMap.set(questionId, {
                    questionId,
                    type,
                    typeName,
                    content: getDetailContent(detail),
                    total: 0,
                    correct: 0,
                    wrong: 0,
                    lastWrongAt: null,
                });
            }

            const item = questionMap.get(questionId);
            item.total += 1;
            if (detail.isCorrect) {
                item.correct += 1;
            } else if (hasUserAnswer(detail)) {
                item.wrong += 1;
                if (!item.lastWrongAt || new Date(result.createTime) > new Date(item.lastWrongAt)) {
                    item.lastWrongAt = result.createTime;
                }
            }
        }
    }

    const typeStats = Array.from(typeMap.values()).map((item) => ({
        ...item,
        accuracy: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0,
    })).sort((left, right) => right.wrong - left.wrong || left.accuracy - right.accuracy);

    const weakQuestions = Array.from(questionMap.values())
        .filter((item) => item.wrong > 0)
        .map((item) => ({
            ...item,
            wrongRate: item.total > 0 ? Math.round((item.wrong / item.total) * 100) : 0,
        }))
        .sort((left, right) => right.wrong - left.wrong || right.wrongRate - left.wrongRate)
        .slice(0, 10);

    return {
        category: {
            _id: String(category._id),
            name: category.name || '未命名试卷',
            count: category.count || 0,
            passingScore: category.passingScore || 60,
            duration: category.duration || 0,
        },
        summary: {
            totalAttempts,
            averageScore,
            highestScore,
            lowestScore,
            passCount,
            passRate: totalAttempts > 0 ? Math.round((passCount / totalAttempts) * 100) : 0,
            averageAccuracy,
            analyzedResultCount: results.filter((item) => Array.isArray(item.details) && item.details.length > 0).length,
        },
        trendData: {
            dates: labels,
            attempts: labels.map((label) => trendMap.get(label)?.attempts || 0),
            averageScores: labels.map((label) => {
                const bucket = trendMap.get(label);
                return bucket && bucket.attempts > 0 ? round(bucket.scoreSum / bucket.attempts) : 0;
            }),
        },
        typeStats,
        weakQuestions,
        recentResults: results.slice(0, 10).map((item) => ({
            id: item._id,
            score: item.score,
            correctCount: item.correctCount,
            totalCount: item.totalCount,
            createTime: item.createTime,
        })),
    };
}

module.exports = {
    buildCategoryAnalysis,
    buildRecentDayLabels,
    toDayLabel,
};
