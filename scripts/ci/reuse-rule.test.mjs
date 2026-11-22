import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// #3962: the owner's reuse rule lives in .claude/rules/product-rules.md and is pointed at from the files an agent always reads
// (CLAUDE.md), from the PR template's Reuse section, and from each reviewer. This pins the pointers so a later edit cannot drop one.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

const SENTENCE = 'If we already have a thing that does something, we SHOULD NOT MAKE A NEW ONE UNLESS WE ARE REPLACING THE OLD ONE WITH A BETTER ONE';

test('the rule file holds the owner sentence', () => {
  assert.ok(read('.claude/rules/product-rules.md').includes(SENTENCE));
});

test('CLAUDE.md, which every session loads, carries the sentence and links the rule', () => {
  const claude = read('CLAUDE.md');
  assert.ok(claude.includes(SENTENCE));
  assert.ok(claude.includes('.claude/rules/product-rules.md'));
});

test('the PR template asks for the searched thing, what it replaces and why it builds new', () => {
  const template = read('.github/pull_request_template.md');
  for (const line of ['## Reuse', 'Existing thing searched:', 'Replaces:', 'Builds new because:']) {
    assert.ok(template.includes(line), `the PR template lost "${line}"`);
  }
});

test('every reviewer and the intent-check skill point at the rule', () => {
  for (const file of [
    '.claude/agents/intent-reviewer.md',
    '.claude/agents/ux-reviewer.md',
    '.claude/agents/lua-reviewer.md',
    '.claude/agents/qa-breaker.md',
    '.claude/agents/narrator-walkthrough.md',
    '.claude/skills/intent-check/SKILL.md',
  ]) {
    assert.ok(read(file).includes('rules/product-rules.md'), `${file} does not point at rules/product-rules.md`);
  }
});
