import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { REPO_ROOT } from './layout.mjs';
import { invokedSkills, judge, reportedCost, validateCases } from './skill-evals.mjs';

const call = (skill) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } });
const text = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } });
const result = (cost) => JSON.stringify({ type: 'result', subtype: 'success', total_cost_usd: cost });

test('invokedSkills: collects Skill calls in order and ignores everything else', () => {
  const stream = [
    call('change-impact-scan'),
    text,
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { skill: 'x' } }] } }),
    call('ecc:plan'),
    'not json',
    result(0.2),
  ].join('\n');
  assert.deepEqual(invokedSkills(stream), ['change-impact-scan', 'ecc:plan']);
});

test('invokedSkills: no output means no calls', () => {
  assert.deepEqual(invokedSkills(''), []);
  assert.deepEqual(invokedSkills(undefined), []);
});

test('reportedCost: reads the result event and defaults to zero', () => {
  assert.equal(reportedCost([text, result(0.25)].join('\n')), 0.25);
  assert.equal(reportedCost(text), 0);
});

test('judge: a trigger case needs the named skill', () => {
  assert.equal(judge({ skill: 'a', expect: 'trigger' }, ['a']).pass, true);
  assert.equal(judge({ skill: 'a', expect: 'trigger' }, ['plug:a']).pass, true);
  assert.match(judge({ skill: 'a', expect: 'trigger' }, []).reason, /no skill called/);
  assert.match(judge({ skill: 'a', expect: 'trigger' }, ['b']).reason, /called b instead/);
});

test('judge: a no-trigger case fails when the skill is called, and another skill does not matter', () => {
  assert.equal(judge({ skill: 'a', expect: 'no-trigger' }, ['b']).pass, true);
  assert.equal(judge({ skill: 'a', expect: 'no-trigger' }, []).pass, true);
  assert.equal(judge({ skill: 'a', expect: 'no-trigger' }, ['a']).pass, false);
});

test('judge: an unknown expectation fails', () => {
  assert.equal(judge({ skill: 'a', expect: 'maybe' }, ['a']).pass, false);
});

test('validateCases: accepts a usable list and names each problem otherwise', () => {
  const good = [
    { id: 'a', prompt: 'p', expect: 'trigger' },
    { id: 'b', prompt: 'q', expect: 'no-trigger' },
  ];
  assert.deepEqual(validateCases(good), []);
  assert.ok(validateCases([]).length > 0);
  assert.ok(validateCases([{ id: 'a', prompt: 'p', expect: 'trigger' }]).some((p) => /no-trigger/.test(p)));
  assert.ok(validateCases([...good, { id: 'a', prompt: 'r', expect: 'trigger' }]).some((p) => /duplicate id a/.test(p)));
  assert.ok(validateCases([{ id: 'a', prompt: ' ', expect: 'nope' }, good[1]]).length >= 2);
});

test('every evals.json in .claude/skills is a valid case list', () => {
  const skills = ['change-impact-scan', 'wire-contract-change', 'reaper-command-add', 'full-verification-gate'];
  for (const skill of skills) {
    const file = join(REPO_ROOT, '.claude', 'skills', skill, 'evals', 'evals.json');
    assert.ok(existsSync(file), `${skill} has no evals/evals.json`);
    assert.deepEqual(validateCases(JSON.parse(readFileSync(file, 'utf8'))), [], skill);
  }
});
