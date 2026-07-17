import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTick, ref } from 'vue';

import { useQuestionRendering } from '../src/features/exam-editor/useQuestionRendering.js';

const makeQuestions = (count) => Array.from({ length: count }, (_, index) => ({
    _id: `q${index}`,
    content: `Question ${index}`,
}));

test('question rendering keeps the selected question visible outside the window', () => {
    const questions = ref(makeQuestions(5));
    const selectedIndex = ref(4);
    const rendering = useQuestionRendering({
        questions,
        selectedIndex,
        initialCount: 2,
        batchSize: 2,
    });

    assert.deepEqual(rendering.renderedQuestionItems.value.map((item) => item.index), [0, 1, 4]);

    rendering.renderMoreQuestions();

    assert.deepEqual(rendering.renderedQuestionItems.value.map((item) => item.index), [0, 1, 2, 3, 4]);
    assert.equal(rendering.remainingQuestionCount.value, 1);
});

test('question rendering loads more near the scroll bottom and scrolls selected nodes', async () => {
    const questions = ref(makeQuestions(6));
    const selectedIndex = ref(0);
    const rendering = useQuestionRendering({
        questions,
        selectedIndex,
        initialCount: 2,
        batchSize: 3,
        scrollThreshold: 8,
    });
    let selector = '';
    let scrollOptions = null;

    rendering.handleQuestionListScroll({
        currentTarget: {
            scrollHeight: 100,
            scrollTop: 77,
            clientHeight: 15,
        },
    });

    assert.equal(rendering.renderedQuestionCount.value, 5);
    assert.equal(rendering.hasMoreRenderedQuestions.value, true);

    rendering.questionListEl.value = {
        querySelector(value) {
            selector = value;
            return {
                scrollIntoView(options) {
                    scrollOptions = options;
                },
            };
        },
    };
    rendering.scrollQuestionIntoView(5);
    await nextTick();

    assert.equal(rendering.renderedQuestionCount.value, 6);
    assert.equal(selector, '[data-question-index="5"]');
    assert.deepEqual(scrollOptions, { behavior: 'smooth', block: 'center' });
});
