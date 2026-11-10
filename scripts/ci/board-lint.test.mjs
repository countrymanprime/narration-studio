import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lintBoard } from './board-lint.mjs';

const lint = (rows, live) => lintBoard({ rows, live });

test('a consistent board has no problems', () => {
  assert.deepEqual(
    lint([
      { id: 'a', section: 'waiting', question: 'Which option?' },
      { id: 'b', section: 'building', session: 's1' },
      { id: 'c', section: 'queued' },
      { id: 'd', section: 'merged', pr: 5 },
    ]),
    [],
  );
});

test('an ask or a question outside waiting is flagged', () => {
  assert.equal(lint([{ id: 'a', section: 'queued', question: 'Yes or no?' }]).length, 1);
  assert.equal(lint([{ id: 'b', section: 'blocked', ask: 'Run the check' }]).length, 1);
});

test('a waiting row needs an ask or a question', () => {
  assert.equal(lint([{ id: 'a', section: 'waiting' }]).length, 1);
  assert.equal(lint([{ id: 'b', section: 'waiting', ask: '  ' }]).length, 1);
});

test('a building row names a session or a PR', () => {
  assert.equal(lint([{ id: 'a', section: 'building' }]).length, 1);
  assert.equal(lint([{ id: 'b', section: 'building', pr: 12 }]).length, 0);
});

test('with a live list, a building row must be in it', () => {
  const live = { sessions: ['s1'], prs: [12] };
  assert.equal(lint([{ id: 'a', section: 'building', session: 's9' }], live).length, 1);
  assert.equal(lint([{ id: 'b', section: 'building', session: 's1' }], live).length, 0);
  assert.equal(lint([{ id: 'c', section: 'building', pr: 12 }], live).length, 0);
});

test('an empty or missing board is fine', () => {
  assert.deepEqual(lintBoard({}), []);
  assert.deepEqual(lintBoard({ rows: [] }), []);
});
