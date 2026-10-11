import assert from 'node:assert/strict';
import test from 'node:test';

import { dedupeStacks } from './dedupe-sarif-stacks.mjs';

const stack = (text) => ({ message: { text }, frames: [] });

test('dedupeStacks removes identical stacks within a result and keeps order', () => {
  const sarif = { runs: [{ results: [{ stacks: [stack('a'), stack('b'), stack('a'), stack('b')] }] }] };

  const removed = dedupeStacks(sarif);

  assert.equal(removed, 2);
  assert.deepEqual(sarif.runs[0].results[0].stacks, [stack('a'), stack('b')]);
});

test('dedupeStacks keeps the same stack in different results', () => {
  const sarif = { runs: [{ results: [{ stacks: [stack('a')] }, { stacks: [stack('a')] }] }] };

  assert.equal(dedupeStacks(sarif), 0);
  assert.equal(sarif.runs[0].results[1].stacks.length, 1);
});

test('dedupeStacks tolerates results without stacks and runs without results', () => {
  const sarif = { runs: [{}, { results: [{ ruleId: 'x' }] }] };

  assert.equal(dedupeStacks(sarif), 0);
});
