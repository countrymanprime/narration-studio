import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { REPO_ROOT, trackedFiles } from './layout.mjs';
import { evaluate, findOptOut, globToRegExp, loadRules, matchesAny, parseHookInput } from './docs-impact.mjs';

const RULES = [
  {
    id: 'bridge',
    paths: ['integrations/reaper/*.lua'],
    exclude: ['integrations/reaper/tests/**'],
    docs: ['docs/architecture/reaper-bridge.md', 'docs/architecture/reaper-navigation.md'],
  },
  { id: 'primitives', paths: ['apps/ui/src/components/primitives/*.tsx'], exclude: ['**/*.test.tsx', '**/*.stories.tsx'], docs: ['docs/ui/**'] },
];

test('globToRegExp: * stays inside one folder and ** crosses folders', () => {
  assert.equal(globToRegExp('a/*.lua').test('a/x.lua'), true);
  assert.equal(globToRegExp('a/*.lua').test('a/b/x.lua'), false);
  assert.equal(globToRegExp('a/**').test('a/b/c/x.md'), true);
  assert.equal(globToRegExp('**/*.test.tsx').test('apps/ui/src/a.test.tsx'), true);
  assert.equal(globToRegExp('**/*.test.tsx').test('a.test.tsx'), true);
});

test('globToRegExp: a dot in the glob is a literal dot', () => {
  assert.equal(globToRegExp('a.lua').test('aXlua'), false);
});

test('matchesAny is false for an empty list', () => {
  assert.equal(matchesAny('a', []), false);
});

test('evaluate: no violation when the change touches no mapped path', () => {
  assert.deepEqual(evaluate({ changed: ['scripts/x.mjs'], rules: RULES }).violations, []);
});

test('evaluate: code changed with no owed doc changed is a violation naming the files and the docs', () => {
  const { violations } = evaluate({ changed: ['integrations/reaper/narration_pickups.lua'], rules: RULES });

  assert.deepEqual(violations, [
    {
      id: 'bridge',
      files: ['integrations/reaper/narration_pickups.lua'],
      docs: ['docs/architecture/reaper-bridge.md', 'docs/architecture/reaper-navigation.md'],
    },
  ]);
});

test('evaluate: changing any one owed doc satisfies the rule', () => {
  const changed = ['integrations/reaper/narration_pickups.lua', 'docs/architecture/reaper-navigation.md'];

  assert.deepEqual(evaluate({ changed, rules: RULES }).violations, []);
});

test('evaluate: a docs glob such as docs/ui/** is satisfied by any file under it', () => {
  const changed = ['apps/ui/src/components/primitives/Button.tsx'];

  assert.equal(evaluate({ changed, rules: RULES }).violations.length, 1);
  assert.deepEqual(evaluate({ changed: [...changed, 'docs/ui/primitives/button.md'], rules: RULES }).violations, []);
});

test('evaluate: tests, stories and the harness are excluded from a rule', () => {
  const changed = ['integrations/reaper/tests/harness.lua', 'apps/ui/src/components/primitives/Button.test.tsx', 'apps/ui/src/components/primitives/Button.stories.tsx'];

  assert.deepEqual(evaluate({ changed, rules: RULES }).violations, []);
});

test('evaluate: a valid opt-out reason waives every violation and is returned', () => {
  const result = evaluate({
    changed: ['integrations/reaper/narration_pickups.lua'],
    rules: RULES,
    text: 'Docs: none — internal rename of a local, no documented name or command',
  });

  assert.deepEqual(result.violations, []);
  assert.equal(result.waivedBy, 'internal rename of a local, no documented name or command');
});

test('evaluate: a vague opt-out reason does not waive the violation', () => {
  for (const reason of ['not needed', 'n/a', 'none', 'no docs', 'skip', 'short']) {
    const result = evaluate({ changed: ['integrations/reaper/narration_pickups.lua'], rules: RULES, text: `Docs: none — ${reason}` });

    assert.equal(result.violations.length, 1, reason);
    assert.equal(result.waivedBy, undefined, reason);
  }
});

test('findOptOut: reads the line from a longer body, with any dash', () => {
  assert.equal(findOptOut('## Summary\n\nDocs: none - refactor inside one package, no documented behaviour\n'), 'refactor inside one package, no documented behaviour');
  assert.equal(findOptOut('Docs: none – refactor inside one package, no documented behaviour'), 'refactor inside one package, no documented behaviour');
  assert.equal(findOptOut('no opt-out here'), undefined);
});

test('findOptOut: trailing spaces are trimmed, and a line of only spaces after the dash is no reason', () => {
  assert.equal(findOptOut('Docs: none — internal rename, nothing documented   \r\nmore'), 'internal rename, nothing documented');
  assert.equal(findOptOut(`Docs: none —${' '.repeat(5000)}`), undefined);
});

test('parseHookInput: reads the stop_hook_active flag and the last message', () => {
  assert.deepEqual(parseHookInput('{"stop_hook_active":true,"last_assistant_message":"done"}'), { active: true, lastMessage: 'done' });
});

test('parseHookInput: bad or empty input yields an inactive hook rather than throwing', () => {
  assert.deepEqual(parseHookInput(''), { active: false, lastMessage: '' });
  assert.deepEqual(parseHookInput('not json'), { active: false, lastMessage: '' });
});

test('the shipped map: every owed doc exists and every code path matches a tracked file', () => {
  const rules = loadRules();
  const files = trackedFiles();

  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.ok(rule.id && rule.paths?.length && rule.docs?.length, `${rule.id}: needs id, paths and docs`);
    assert.ok(
      rule.paths.some((glob) => files.some((file) => globToRegExp(glob).test(file))),
      `${rule.id}: no tracked file matches ${rule.paths.join(', ')}`,
    );
    for (const doc of rule.docs) {
      const exists = doc.includes('*') ? files.some((file) => globToRegExp(doc).test(file)) : existsSync(join(REPO_ROOT, doc));
      assert.ok(exists, `${rule.id}: owed doc ${doc} does not exist`);
    }
  }
});

test('the shipped map: rule ids are unique', () => {
  const ids = loadRules().map((rule) => rule.id);

  assert.equal(new Set(ids).size, ids.length);
});
