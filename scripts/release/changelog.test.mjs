import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChangelog, parseEntry, renderChangelog } from './changelog.mjs';

const pr = (subject, body = '', sha = 'abc1234') => ({ sha, subject, body });

test('golden: groups by Important, Added, Changed, Fixed with one line per pull request', () => {
  const groups = buildChangelog([
    pr('feat(booth): follow a word said like the script\'s (#2920)', 'Closes #2900\nRefs #2800\n'),
    pr('fix(ui): stop the sidebar flicker (#2931)', 'Fixes #2930'),
    pr('perf(analysis): read the chapter once (#2940)'),
    pr('feat(settings)!: rename the models folder (#2950)', 'BREAKING CHANGE: the folder is now called voices; move it by hand.'),
    pr('fix(update): keep the staged zip (#2960)', 'Migration: delete update-staging once.\nKnown issue: the first check can take a minute.\nCloses #2959'),
  ]);

  assert.equal(
    renderChangelog(groups, { footer: 'More in the README.' }),
    [
      '## Important',
      '',
      '- rename the models folder: the folder is now called voices; move it by hand. (#2950)',
      '- Migration: delete update-staging once. (#2960, closes #2959)',
      '- Known issue: the first check can take a minute. (#2960, closes #2959)',
      '',
      '## Added',
      '',
      "- follow a word said like the script's (#2920, closes #2900, refs #2800)",
      '',
      '## Changed',
      '',
      '- read the chapter once (#2940)',
      '',
      '## Fixed',
      '',
      '- stop the sidebar flicker (#2931, closes #2930)',
      '- keep the staged zip (#2960, closes #2959)',
      '',
      'More in the README.',
      '',
    ].join('\n'),
  );
});

test('a breaking change appears only in Important; a note leaves its pull request in its own section', () => {
  const groups = buildChangelog([pr('feat!: drop the old format (#1)'), pr('fix: a thing (#2)', 'Known issue: slow once.')]);

  assert.deepEqual(groups.important.map((entry) => entry.text), ['drop the old format', 'Known issue: slow once.']);
  assert.deepEqual(groups.added, []);
  assert.deepEqual(groups.fixed.map((entry) => entry.text), ['a thing']);
});

test('docs, CI, tests and chores do not reach the page; an untyped title is a change', () => {
  const groups = buildChangelog([pr('docs: reword (#1)'), pr('ci: pin (#2)'), pr('chore(deps): bump (#3)'), pr('test: more (#4)'), pr('Tidy the settings page (#5)')]);

  assert.deepEqual(groups.changed.map((entry) => entry.text), ['Tidy the settings page']);
  assert.deepEqual([groups.important, groups.added, groups.fixed], [[], [], []]);
});

test('a commit with no pull request number is named by its short hash', () => {
  assert.equal(renderChangelog(buildChangelog([pr('fix: direct push', '', 'deadbee')])).split('\n')[2], '- direct push (deadbee)');
});

test('the pull request is not listed as closing or referring to itself, and an issue is listed once', () => {
  const entry = parseEntry(pr('fix: x (#10)', 'Closes #10\nCloses #7\nfixes #7\nRefs #8'));

  assert.deepEqual([entry.closes, entry.refs], [[7], [8]]);
});

test('a title cannot mention an account, run on, or contain line breaks', () => {
  const entry = parseEntry(pr(`fix: thanks @someone ${'x'.repeat(400)} (#3)`));

  assert.ok(!/@[A-Za-z]/.test(entry.text), entry.text);
  assert.ok(entry.text.length <= 200);
  assert.ok(!entry.text.includes('\n'));
});

test('no entries says so, with the footer', () => {
  assert.equal(renderChangelog(buildChangelog([]), { footer: 'F' }), 'No changes that affect the app since the previous release.\n\nF\n');
});

test('the same entries give the same groups for any consumer (the in-app update changelog reads buildChangelog)', () => {
  const entries = [pr('feat: a (#1)'), pr('fix: b (#2)')];

  assert.deepEqual(buildChangelog(entries), buildChangelog(entries));
  assert.deepEqual(Object.keys(buildChangelog([])), ['important', 'added', 'changed', 'fixed']);
});
