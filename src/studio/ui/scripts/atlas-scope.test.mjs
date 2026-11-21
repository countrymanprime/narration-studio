import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeScope, scopeOf } from './atlas-scope.mjs';

const UI = 'src/studio/ui/';
const module = (source, ...imports) => ({ source, dependencies: imports.map((resolved) => ({ resolved })) });
// Button <- Card <- Card.stories; Button <- Button.stories; Page <- Page.stories; styles.css and theme <- preview.
const GRAPH = [
  module('.storybook/preview.tsx', 'src/styles.css', 'src/theme/theme.ts'),
  module('.storybook/main.ts'),
  module('src/styles.css'),
  module('src/theme/theme.ts'),
  module('src/components/primitives/Button.tsx', 'src/theme/tokens.ts'),
  module('src/theme/tokens.ts'),
  module('src/components/primitives/Button.stories.tsx', 'src/components/primitives/Button.tsx'),
  module('src/components/primitives/Button.test.tsx', 'src/components/primitives/Button.tsx'),
  module('src/components/primitives/Card.tsx', 'src/components/primitives/Button.tsx'),
  module('src/components/primitives/Card.stories.tsx', 'src/components/primitives/Card.tsx'),
  module('src/components/proof/Page.tsx'),
  module('src/components/proof/Page.stories.tsx', 'src/components/proof/Page.tsx'),
  module('src/App.tsx', 'src/components/proof/Page.tsx'),
];
const BUTTON = 'src/components/primitives/Button.stories.tsx';
const CARD = 'src/components/primitives/Card.stories.tsx';
const PAGE = 'src/components/proof/Page.stories.tsx';
const stories = (...changed) =>
  scopeOf(
    changed.map((file) => `${UI}${file}`),
    GRAPH,
  ).stories;

test('a run that is not a pull request owes every story', () => {
  assert.equal(scopeOf(null, GRAPH).everything, true);
});

test('a changed story file owes its own stories', () => {
  assert.deepEqual(stories(PAGE), [PAGE]);
});

test('a changed component owes every story that imports it, directly or through another component', () => {
  assert.deepEqual(stories('src/components/primitives/Card.tsx'), [CARD]);
  assert.deepEqual(stories('src/components/primitives/Button.tsx'), [BUTTON, CARD]);
  assert.deepEqual(stories('src/theme/tokens.ts'), [BUTTON, CARD]);
  assert.deepEqual(stories('src/components/proof/Page.tsx', 'src/components/primitives/Card.tsx'), [CARD, PAGE]);
});

test('a unit test or source no story imports owes no story', () => {
  assert.deepEqual(stories('src/components/primitives/Button.test.tsx', 'src/App.tsx'), []);
});

test('what Storybook cannot read owes no story: a doc, another toolchain’s project, the visual and aria suites, a contract fixture', () => {
  const changed = [
    'docs/x.md',
    'docs/images/ui/booth.png',
    'README.md',
    'src/studio/desktop/app.go',
    'src/studio/sidecars/align/main.py',
    'src/studio/libs/python/x.py',
    'src/studio/integrations/reaper/bridge.lua',
    `${UI}tests/visual/catalog/booth.ts`,
    `${UI}tests/aria/aria.spec.ts`,
    'tests/fixtures/contracts/x.json',
  ];
  assert.deepEqual(scopeOf(changed, GRAPH).stories, []);
});

test('a file of another project that a story imports is followed like any module', () => {
  const graph = [...GRAPH, module('../desktop/testdata/golden.json'), module('src/components/proof/Golden.stories.tsx', '../desktop/testdata/golden.json')];
  assert.deepEqual(scopeOf(['src/studio/desktop/testdata/golden.json'], graph).stories, ['src/components/proof/Golden.stories.tsx']);
});

test('what every story loads owes every story', () => {
  for (const file of ['src/styles.css', 'src/theme/theme.ts', '.storybook/preview.tsx', '.storybook/main.ts']) {
    assert.match(scopeOf([`${UI}${file}`, `${UI}${PAGE}`], GRAPH).reason, /which every story loads/, file);
  }
});

test('any other file the graph does not hold owes every story', () => {
  for (const file of [
    `${UI}src/components/proof/Gone.tsx`,
    `${UI}src/tokens.css`,
    `${UI}src/assets/logo.svg`,
    `${UI}.storybook/preview-head.html`,
    `${UI}tests/atlas/atlas.spec.ts`,
    `${UI}tests/atlasFilter.ts`,
    `${UI}playwright.atlas.config.ts`,
    `${UI}package.json`,
    `${UI}public/favicon.svg`,
    'pnpm-lock.yaml',
    '.github/workflows/_quality.yml',
    'scripts/ci/pr-scope.mjs',
    'config/defaults.json',
  ]) {
    assert.match(scopeOf([file, `${UI}${PAGE}`], GRAPH).reason, /not a module of the import graph/, file);
  }
});

test('describeScope says what runs and what is left to main', () => {
  assert.match(describeScope(scopeOf(null, GRAPH)), /^atlas scope: every story \(not a pull request/);
  assert.equal(describeScope(scopeOf([`${UI}src/App.tsx`], GRAPH)), 'atlas scope: the change reaches no story; every story runs on main after the merge.');
  assert.equal(
    describeScope(scopeOf([`${UI}src/components/proof/Page.tsx`], GRAPH)),
    `atlas scope: 1 story files the change reaches (${PAGE}); the other stories run on main after the merge.`,
  );
});
