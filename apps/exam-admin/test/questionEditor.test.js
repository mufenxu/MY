import assert from 'node:assert/strict';
import test from 'node:test';
import { ref } from 'vue';

import { useQuestionEditor } from '../src/features/exam-editor/useQuestionEditor.js';

test('question editor selection updates the active question safely', () => {
    const questions = ref([
        { _id: 'q1', content: 'Question 1' },
        { _id: 'q2', content: 'Question 2' },
        { _id: 'q3', content: 'Question 3' },
    ]);
    const selectedIndex = ref(0);
    const mobilePropVisible = ref(false);
    const rendered = [];
    const editor = useQuestionEditor({
        isResponsiveEditor: () => true,
        mobilePropVisible,
        questions,
        selectedIndex,
        ensureQuestionRendered: (index) => rendered.push(index),
    });

    editor.selectQuestion(2);

    assert.equal(selectedIndex.value, 2);
    assert.equal(mobilePropVisible.value, true);
    assert.deepEqual(rendered, [2]);

    editor.selectQuestion(9);

    assert.equal(selectedIndex.value, 2);
    assert.deepEqual(rendered, [2]);
});
