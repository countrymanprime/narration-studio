import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate } from './pr-issue-link.mjs';

const warn = (input) => evaluate(input).warnings.length;

test('a fix or feat with no issue line warns', () => {
  assert.equal(warn({ title: 'fix(ui): stop the flicker', body: 'Closes #' }), 1);
  assert.equal(warn({ title: 'feat: add export', body: '' }), 1);
  assert.equal(warn({ title: 'fix!: break it', body: undefined }), 1);
});

test('Closes, Fixes, Resolves, Refs and Part of satisfy it', () => {
  for (const line of ['Closes #12', 'fixes #12', 'Resolved #12', 'Refs #12', 'Part of #12', 'Refs: #12']) {
    assert.equal(warn({ title: 'fix: x', body: `Body\n\n${line}\n` }), 0, line);
  }
});

test('Issue: none needs a specific reason', () => {
  assert.equal(warn({ title: 'fix: x', body: 'Issue: none — typo found while reading' }), 0);
  assert.equal(warn({ title: 'fix: x', body: 'Issue: none' }), 1);
  assert.equal(warn({ title: 'fix: x', body: 'Issue: none — n/a' }), 1);
});

test('other types owe nothing', () => {
  for (const title of ['docs: x', 'chore(ci): x', 'test: x', 'refactor: x', 'feature: x', 'prefix: x']) {
    assert.equal(warn({ title, body: '' }), 0, title);
  }
});

test('an example inside a code fence is not a link', () => {
  assert.equal(warn({ title: 'fix: x', body: '```\nCloses #12\n```\n' }), 1);
});

test('Closes on a stacked pull request warns that GitHub will not close the issue', () => {
  const { warnings } = evaluate({ title: 'docs: x', body: 'Closes #12', base: 'feat/previous', defaultBranch: 'main' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /feat\/previous/);
  assert.equal(warn({ title: 'docs: x', body: 'Closes #12', base: 'main' }), 0);
  assert.equal(warn({ title: 'docs: x', body: 'Refs #12', base: 'feat/previous' }), 0);
});
