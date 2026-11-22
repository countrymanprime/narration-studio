import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// #3962: the owner's reuse rule lives in .claude/rules/product-rules.md and is pointed at from the files an agent always reads
// (CLAUDE.md), from the PR template's Reuse section, and from each reviewer. This pins the pointers so a later edit cannot drop one.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

const RULE = 'do not build a new thing when one already does the job, unless the new one replaces the old one with a better one or';

test('the rule file holds the rule sentence', () => {
  assert.ok(read('.claude/rules/product-rules.md').toLowerCase().includes(RULE));
});

test('CLAUDE.md, which every session loads, carries the rule sentence and links the rule', () => {
  const claude = read('CLAUDE.md');
  assert.ok(claude.toLowerCase().includes(RULE));
  assert.ok(claude.includes('Reuse is the default, a small or zero gain never skips a consolidation'), 'CLAUDE.md lost the reuse-default clause');
  assert.ok(claude.includes('.claude/rules/product-rules.md'));
});

test('the PR template asks for the searched thing, what it replaces and why it builds new', () => {
  const template = read('.github/pull_request_template.md');
  for (const line of [/^## Reuse$/m, /^Existing thing searched:/m, /^Replaces:/m, /^Builds new because:/m]) {
    assert.ok(line.test(template), `the PR template lost the ${line} line`);
  }
});

test('the rule file holds the default, the small-gain clause and both reasons to build new', () => {
  const rule = read('.claude/rules/product-rules.md');
  for (const phrase of ['Reuse is the default', 'small or zero performance gain', 'Builds new because:', '(a) reusing makes it way worse', '(b) reusing means changing', 'a PR that skips a consolidation because the gain is small fails the review']) {
    assert.ok(rule.includes(phrase), `product-rules.md lost "${phrase}"`);
  }
});

test('every reviewer, the intent and design skills, the coordinator and the worker files name the reason to build new', () => {
  for (const file of [
    '.claude/agents/intent-reviewer.md',
    '.claude/agents/ux-reviewer.md',
    '.claude/agents/lua-reviewer.md',
    '.claude/agents/qa-breaker.md',
    '.claude/agents/narrator-walkthrough.md',
    '.claude/agents/standards-auditor.md',
    '.claude/skills/intent-check/SKILL.md',
    '.claude/skills/change-impact-scan/SKILL.md',
    '.claude/skills/solid-design-review/SKILL.md',
    '.claude/skills/design-principles/SKILL.md',
    '.claude/skills/frontend-primitives/SKILL.md',
    '.claude/skills/agent-train/references/coordinator.md',
    '.claude/skills/agent-train/references/ponytail.md',
    '.claude/skills/agent-train/references/worker.md',
  ]) {
    const text = read(file);
    assert.ok(text.includes('rules/product-rules.md'), `${file} does not point at rules/product-rules.md`);
    assert.ok(text.includes('Builds new because'), `${file} does not name \`Builds new because:\``);
  }
});

test('the agent-train worker, resume and fixer prompts point at the rule', () => {
  const templates = read('.claude/skills/agent-train/references/templates.md');
  assert.ok((templates.match(/ONE THING PER JOB/g) ?? []).length >= 3, 'templates.md needs the rule in the worker, resume and fixer prompts');
});

test('the merge-gating reviewers fail a consolidation skipped for a small gain', () => {
  for (const file of [
    '.claude/agents/intent-reviewer.md',
    '.claude/agents/ux-reviewer.md',
    '.claude/skills/intent-check/SKILL.md',
    '.claude/skills/solid-design-review/SKILL.md',
    '.claude/skills/agent-train/references/coordinator.md',
  ]) {
    assert.match(read(file), /gain is small|small gain/, `${file} lost the small-gain fail clause`);
  }
});
