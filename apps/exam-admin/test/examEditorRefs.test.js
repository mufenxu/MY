import assert from 'node:assert/strict';
import test from 'node:test';
import { computed, ref } from 'vue';

import { isRefLike, refValue } from '../src/features/exam-editor/refUtils.js';
import { useBatchImport } from '../src/features/exam-editor/useBatchImport.js';

test('refValue unwraps refs and computed values (prototype accessor)', () => {
    const count = ref(3);
    const doubled = computed(() => count.value * 2);

    assert.equal(isRefLike(count), true);
    assert.equal(isRefLike(doubled), true);
    assert.equal(isRefLike([1, 2]), false);
    assert.equal(refValue(count), 3);
    assert.equal(refValue(doubled), 6);
    assert.equal(refValue('plain'), 'plain');
});

test('batch import reads the ref question list instead of the ref object', () => {
    const questions = ref([
        {
            _id: 'q-1',
            type: 'single',
            content: '已经存在的题目',
            options: [{ label: 'A', value: '甲', isAnswer: true }, { label: 'B', value: '乙' }],
        },
    ]);
    const batch = useBatchImport({ canEdit: ref(true), existingQuestions: questions });

    batch.batchForm.text = '1. 新增题目一？\nA. 甲\nB. 乙\n答案: A';
    const parsed = batch.runBatchParse({ silent: true });

    assert.equal(parsed.length, 1);
    assert.equal(batch.batchQualityStats.value.importTotal, 1);
    assert.equal(batch.batchQualityStats.value.afterImportTotal, 2);
    assert.equal(batch.batchQualityStats.value.existingTotal, 1);
    assert.equal(batch.batchQualityStats.value.typeCounts.single, 1);
});

test('batch import respects a ref canEdit=false', () => {
    const batch = useBatchImport({ canEdit: ref(false), existingQuestions: ref([]) });

    batch.batchForm.text = '1. 不会被解析？\nA. 甲\nB. 乙\n答案: A';

    assert.deepEqual(batch.runBatchParse({ silent: true }), []);
    assert.equal(batch.batchPreview.value.length, 0);
});
