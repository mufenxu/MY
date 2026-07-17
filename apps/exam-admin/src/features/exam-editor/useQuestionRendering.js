import { computed, nextTick, ref, unref } from 'vue';

const DEFAULT_INITIAL_RENDERED_QUESTION_COUNT = 80;
const DEFAULT_RENDER_QUESTION_BATCH_SIZE = 80;
const DEFAULT_QUESTION_LIST_SCROLL_THRESHOLD = 640;

function readQuestionList(questions) {
    const value = unref(questions);
    return Array.isArray(value) ? value : [];
}

function readSelectedIndex(selectedIndex) {
    return Number(unref(selectedIndex) ?? -1);
}

export function useQuestionRendering({
    questions,
    selectedIndex,
    initialCount = DEFAULT_INITIAL_RENDERED_QUESTION_COUNT,
    batchSize = DEFAULT_RENDER_QUESTION_BATCH_SIZE,
    scrollThreshold = DEFAULT_QUESTION_LIST_SCROLL_THRESHOLD,
} = {}) {
    const renderedQuestionCount = ref(initialCount);
    const questionListEl = ref(null);

    const renderedQuestionItems = computed(() => {
        const questionList = readQuestionList(questions);
        const limit = Math.min(renderedQuestionCount.value, questionList.length);
        const items = questionList.slice(0, limit).map((question, index) => ({ question, index }));
        const currentIndex = readSelectedIndex(selectedIndex);

        if (currentIndex >= limit && currentIndex < questionList.length) {
            items.push({
                question: questionList[currentIndex],
                index: currentIndex,
            });
        }

        return items;
    });

    const hasMoreRenderedQuestions = computed(() => (
        renderedQuestionCount.value < readQuestionList(questions).length
    ));
    const remainingQuestionCount = computed(() => Math.max(
        readQuestionList(questions).length - renderedQuestionCount.value,
        0,
    ));

    const resetRenderedQuestionWindow = () => {
        renderedQuestionCount.value = Math.min(initialCount, readQuestionList(questions).length);
    };

    const renderMoreQuestions = (count = batchSize) => {
        renderedQuestionCount.value = Math.min(
            readQuestionList(questions).length,
            renderedQuestionCount.value + count,
        );
    };

    const ensureQuestionRendered = (index) => {
        const questionIndex = Number(index);
        if (!Number.isFinite(questionIndex) || questionIndex < 0 || questionIndex < renderedQuestionCount.value) {
            return;
        }

        renderedQuestionCount.value = Math.min(readQuestionList(questions).length, questionIndex + 1);
    };

    const handleQuestionListScroll = (event) => {
        const target = event?.currentTarget;
        if (!target || !hasMoreRenderedQuestions.value) return;

        const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
        if (distanceToBottom <= scrollThreshold) {
            renderMoreQuestions();
        }
    };

    const scrollQuestionIntoView = (index) => {
        ensureQuestionRendered(index);
        nextTick(() => {
            const container = questionListEl.value;
            const node = container?.querySelector?.(`[data-question-index="${Number(index)}"]`);
            node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        });
    };

    return {
        hasMoreRenderedQuestions,
        questionListEl,
        remainingQuestionCount,
        renderedQuestionCount,
        renderedQuestionItems,
        ensureQuestionRendered,
        handleQuestionListScroll,
        renderMoreQuestions,
        resetRenderedQuestionWindow,
        scrollQuestionIntoView,
    };
}
