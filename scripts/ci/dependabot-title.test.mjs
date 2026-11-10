import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { lowercaseDependabotTitle } from './dependabot-title.mjs';

const commitlint = (title) => {
  try {
    execFileSync('pnpm', ['exec', 'commitlint'], { input: `${title}\n`, stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
};

// The titles of #3244 to #3255 as Dependabot wrote them, before they were edited by hand.
const dependabot = [
  'chore(deps): Bump the tooling group with 15 updates',
  'chore(deps): Bump actions/setup-python from 5.6.0 to 7.1.0 in /.github/actions/setup-toolchain',
  'chore(deps): Bump actions/setup-go from 5.6.0 to 7.0.0 in /.github/actions/setup-toolchain',
  'chore(deps): Bump JohnnyMorganz/stylua-action from 4.1.0 to 5.0.0 in /.github/actions/setup-toolchain',
  'chore(deps): Bump pnpm/action-setup from 4.3.0 to 6.1.1 in /.github/actions/setup-toolchain',
  'chore(deps): Bump the github-actions group across 2 directories with 5 updates',
  'chore(deps): Bump pypdf from 6.21.4 to 7.0.0',
  'chore(deps): Bump the python-dependencies group with 5 updates',
  'chore(deps): Bump the go-dependencies group in /src/studio/desktop with 2 updates',
];

test('each Dependabot title becomes its lowercase form and passes commitlint', () => {
  for (const title of dependabot) {
    const fixed = lowercaseDependabotTitle(title);
    const lowered = title.replace(': Bump', ': bump');
    assert.equal(fixed, lowered.length > 100 ? lowered.replace(/ in \/\S*$/, '') : lowered);
    assert.ok(commitlint(fixed), fixed);
  }
});

test('the capitalized originals fail commitlint, so the rule is not weakened', () => {
  assert.equal(commitlint(dependabot[0]), false);
});

test('other titles come back unchanged, so a human title with a capital still fails', () => {
  for (const title of [
    'feat(ui): Add a thing',
    'fix: Bump the retry count',
    'chore: Bump the version',
    'chore(deps): bump x from 1 to 2',
    'chore(deps): Bumpy ride',
    'chore(deps): Bump',
    'docs(deps): Bump x',
    'Bump x from 1 to 2',
  ]) {
    assert.equal(lowercaseDependabotTitle(title), title, title);
  }
  assert.equal(commitlint(lowercaseDependabotTitle('feat(ui): Add a thing')), false);
});

test('a header over 100 characters loses its trailing directory; one still too long stays failing', () => {
  const fixed = lowercaseDependabotTitle(dependabot[3]);
  assert.equal(fixed, 'chore(deps): bump JohnnyMorganz/stylua-action from 4.1.0 to 5.0.0');
  assert.equal(commitlint(dependabot[3]), false);
  const long = `chore(deps): Bump ${'x'.repeat(100)}`;
  assert.equal(commitlint(lowercaseDependabotTitle(long)), false);
});

test('Update titles and the dev-dependency scope are handled', () => {
  assert.equal(lowercaseDependabotTitle('chore(deps-dev): Update x requirement from 1 to 2'), 'chore(deps-dev): update x requirement from 1 to 2');
});
