import assert from 'node:assert/strict';
import test from 'node:test';

import { decide, findOptOut, gatedFiles, parseHookInput } from './gate-stamp.mjs';

const code = ['apps/ui/src/App.tsx'];

test('gatedFiles ignores prose, agent config and scratch output', () => {
  assert.deepEqual(gatedFiles(['docs/a.md', 'README.md', '.claude/skills/x/SKILL.md', '.cache/x', ...code]), code);
});

test('decide: docs-only change is let through', () => {
  assert.equal(decide({ changed: ['docs/a.md'], currentHash: 'b' }).block, false);
});

test('decide: code change with a matching stamp is let through', () => {
  assert.equal(decide({ changed: code, stampedHash: 'a', currentHash: 'a' }).block, false);
});

test('decide: code change with no stamp is blocked', () => {
  const result = decide({ changed: code, currentHash: 'a' });
  assert.equal(result.block, true);
  assert.match(result.reason, /pnpm check/);
});

test('decide: a stale stamp is blocked and says something changed', () => {
  const result = decide({ changed: code, stampedHash: 'old', currentHash: 'new' });
  assert.equal(result.block, true);
  assert.match(result.reason, /earlier one/);
});

test('decide: an opt-out with a real reason waives the block', () => {
  const result = decide({ changed: code, currentHash: 'a', lastMessage: 'Gate: skipped — worker stream runs the targeted set' });
  assert.equal(result.block, false);
  assert.match(result.waivedBy, /targeted set/);
});

test('findOptOut: a vague or missing reason does not count', () => {
  assert.equal(findOptOut('Gate: skipped — n/a'), undefined);
  assert.equal(findOptOut('nothing here'), undefined);
});

test('parseHookInput: reads the loop guard and tolerates garbage', () => {
  assert.equal(parseHookInput('{"stop_hook_active":true}').active, true);
  assert.deepEqual(parseHookInput('not json'), { active: false, lastMessage: '' });
});
