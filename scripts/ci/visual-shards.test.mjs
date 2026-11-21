import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PAGES,
  assertPartition,
  assign,
  describeScope,
  describeTest,
  groupKey,
  importersOf,
  inScope,
  loaderLines,
  pagesNamedIn,
  planTests,
  scopeOf,
  testsOfReport,
  weightsOf,
} from './visual-shards.mjs';

const spec = (file, title, duration) => ({ file, title, tests: [{ results: duration === undefined ? [] : [{ duration }] }] });
const report = (...suites) => ({ suites });

test('testsOfReport walks describe blocks and sums a test’s result times', () => {
  const found = testsOfReport(
    report({
      title: 'a.spec.ts',
      file: 'a.spec.ts',
      specs: [spec('a.spec.ts', 'Page / state', 2000)],
      suites: [{ title: 'group', specs: [spec('a.spec.ts', 'inner', 500)] }],
    }),
  );
  assert.deepEqual(found, [
    { file: 'a.spec.ts', loadFile: 'a.spec.ts', titlePath: ['Page / state'], seconds: 2 },
    { file: 'a.spec.ts', loadFile: 'a.spec.ts', titlePath: ['group', 'inner'], seconds: 0.5 },
  ]);
});

test('describeTest refuses a title a test list cannot carry', () => {
  for (const title of ['a > b', 'a › b', ' padded', '[project] x']) {
    assert.throws(() => describeTest({ file: 'a.spec.ts', titlePath: [title], seconds: 0 }), /cannot be written in a --test-list/);
  }
  assert.equal(describeTest({ file: 'a.spec.ts', titlePath: ['g', 'x / y'], seconds: 0 }).line, 'a.spec.ts › g › x / y');
});

test('groupKey keeps the file and the first two parts of the title', () => {
  assert.equal(groupKey('overlays.ts', ['Script / context menu on the page / desktop']), 'overlays.ts|Script / context menu on the page');
  assert.equal(groupKey('app.spec.ts', ['engine / link-chapters-error / tablet']), 'app.spec.ts|engine / link-chapters-error');
  assert.equal(groupKey('app.spec.ts', ['project / picker-empty']), 'app.spec.ts|project / picker-empty');
});

test('planTests estimates from the group, then the file, then the fallback, and merges a repeated title', () => {
  const tests = [
    { file: 'a.spec.ts', titlePath: ['P / s / desktop'], seconds: 0 },
    { file: 'a.spec.ts', titlePath: ['Q / t / desktop'], seconds: 0 },
    { file: 'b.spec.ts', titlePath: ['R / u'], seconds: 0 },
    { file: 'b.spec.ts', titlePath: ['R / u'], seconds: 0 },
  ];
  const plan = planTests(tests, { fallback: 7, files: { 'a.spec.ts': 3 }, groups: { 'a.spec.ts|P / s': 5 } });
  assert.deepEqual(
    plan.map((item) => [item.line, item.estimate]),
    [
      ['a.spec.ts › P / s / desktop', 5],
      ['a.spec.ts › Q / t / desktop', 3],
      ['b.spec.ts › R / u', 14],
    ],
  );
});

test('loaderLines names the spec file of a test declared in a helper, and refuses an ambiguous file', () => {
  const declared = [
    { file: 'helpers/guard.ts', loadFile: 'overlays.spec.ts', line: 'x' },
    { file: 'a.spec.ts', loadFile: 'a.spec.ts', line: 'y' },
  ];
  assert.deepEqual(loaderLines(declared), ['overlays.spec.ts']);
  assert.throws(() => loaderLines([...declared, { file: 'overlays.spec.ts', loadFile: 'overlays.spec.ts', line: 'z' }]), /cannot tell them apart/);
});

const items = (estimates) => estimates.map((estimate, index) => ({ line: `t${String(index).padStart(3, '0')}`, estimate }));

test('assign puts every test in exactly one shard and the aria suite in exactly one', () => {
  const all = items([30, 28, 25, 20, 20, 18, 12, 10, 9, 9, 8, 5, 4, 3, 3, 2, 1]);
  const loads = assign(all, 3, 49);
  assertPartition(all, loads);
  assert.equal(loads.filter((load) => load.aria).length, 1);
});

test('assign is deterministic and balances closer than cutting by count', () => {
  const estimates = [...Array.from({ length: 6 }, () => 40), ...Array.from({ length: 60 }, () => 4)];
  const all = items(estimates);
  const a = assign(all, 3, 0).map((load) => load.tests.map((t) => t.line));
  const b = assign([...all].reverse(), 3, 0).map((load) => load.tests.map((t) => t.line));
  assert.deepEqual(a, b);
  const seconds = assign(all, 3, 0).map((load) => load.seconds);
  assert.ok(Math.max(...seconds) - Math.min(...seconds) <= 4, `shards differ by ${Math.max(...seconds) - Math.min(...seconds)} s`);
  // Cut by count (what --shard does) the same list in order: the six heavy tests, listed first, share two shards.
  const byCount = [0, 1, 2].map((shard) => estimates.slice(shard * 22, shard * 22 + 22).reduce((sum, value) => sum + value, 0));
  assert.ok(Math.max(...byCount) - Math.min(...byCount) > 100);
});

test('the shard that runs aria gets fewer tests', () => {
  const loads = assign(items(Array.from({ length: 90 }, () => 10)), 3, 49);
  const aria = loads.find((load) => load.aria);
  assert.ok(aria.tests.length < 30);
  assert.ok(Math.max(...loads.map((load) => load.seconds)) - Math.min(...loads.map((load) => load.seconds)) <= 10);
});

test('a reserve on the first shard gives it fewer tests and keeps the partition', () => {
  const all = items(Array.from({ length: 100 }, () => 10));
  const loads = assign(all, 5, 0, 100);
  assertPartition(all, loads);
  assert.ok(loads[0].tests.length < loads[1].tests.length, `shard 1 has ${loads[0].tests.length} tests, shard 2 ${loads[1].tests.length}`);
  // The reserve counts in the first shard's load, so the five loads still end within one test of each other.
  assert.ok(Math.max(...loads.map((load) => load.seconds)) - Math.min(...loads.map((load) => load.seconds)) <= 10);
});

test('assertPartition fails on a missing and on a duplicated test', () => {
  const all = items([5, 4, 3]);
  const loads = assign(all, 2, 0);
  const missing = structuredClone(loads);
  missing[0].tests.pop();
  missing[1].tests.pop();
  assert.throws(() => assertPartition(all, missing), /exactly once/);
  const twice = structuredClone(loads);
  twice[1].tests.push(loads[0].tests[0]);
  assert.throws(() => assertPartition(all, twice), /exactly once/);
});

test('weightsOf averages per group and per file, ignoring tests with no time', () => {
  const run = report({
    title: 'a.spec.ts',
    specs: [
      spec('a.spec.ts', 'P / s / desktop', 4000),
      spec('a.spec.ts', 'P / s / tablet', 2000),
      spec('a.spec.ts', 'Q / t / desktop', 9000),
      spec('a.spec.ts', 'skipped one'),
    ],
  });
  const weights = weightsOf([run]);
  assert.equal(weights.groups['a.spec.ts|P / s'], 3);
  assert.equal(weights.groups['a.spec.ts|Q / t'], 9);
  assert.equal(weights.files['a.spec.ts'], 5);
  assert.equal(weights.fallback, 5);
});

const UI = 'src/studio/ui/';
const matrix = { file: 'app.spec.ts', loadFile: 'app.spec.ts', titlePath: ['booth / default'] };
const boothSpec = { file: 'booth-keys.spec.ts', loadFile: 'booth-keys.spec.ts', titlePath: ['Booth keys', 'Space rolls'] };
const proofSpec = { file: 'proof-notes.spec.ts', loadFile: 'proof-notes.spec.ts', titlePath: ['a note'] };
const dialogSpec = { file: 'dialog-early-escape.spec.ts', loadFile: 'dialog-early-escape.spec.ts', titlePath: ['Escape closes'] };
const editingOverlay = { file: 'helpers/overlayGuardFor.ts', loadFile: 'overlays.spec.ts', titlePath: ['Editing / row menu / desktop'] };
const scriptOverlay = { file: 'helpers/overlayGuardFor.ts', loadFile: 'overlays.spec.ts', titlePath: ['Script / context menu on the page / tablet'] };
const suite = [matrix, boothSpec, proofSpec, dialogSpec, editingOverlay, scriptOverlay];
const owed = (changed) => suite.filter((item) => inScope(item, scopeOf(changed)));

test('a run that is not a pull request owes the whole suite', () => {
  assert.equal(scopeOf(null).everything, true);
  assert.deepEqual(owed(null), suite);
});

test('the state matrix runs on every pull request, whatever it changed', () => {
  for (const changed of [[], ['docs/x.md'], [`${UI}src/components/booth/page/BoothNextPage.tsx`], [`${UI}src/hooks/useThing.ts`]]) {
    assert.ok(owed(changed).includes(matrix), JSON.stringify(changed));
  }
});

test('a change inside one page owes that page’s specs and overlay rows, and no other page’s', () => {
  assert.deepEqual(owed([`${UI}src/components/booth/page/BoothNextPage.tsx`]), [matrix, boothSpec, dialogSpec]);
  assert.deepEqual(owed([`${UI}src/components/editing/EditingPage.tsx`]), [matrix, dialogSpec, editingOverlay]);
  assert.deepEqual(owed([`${UI}src/components/masterqc/page/Page.tsx`]), [matrix, dialogSpec]);
});

test('a spec named for no page may drive one under another name, so a change inside any page owes it', () => {
  for (const name of [
    'deliveryProfileHeader.spec.ts',
    'models-folder-small.spec.ts',
    'colour-field.spec.ts',
    'reader-follow.spec.ts',
    'link-dialog-long-name.spec.ts',
  ]) {
    const spec = { file: name, loadFile: name, titlePath: ['x'] };
    assert.equal(inScope(spec, scopeOf([`${UI}src/components/delivery/page/Header.tsx`])), true, name);
    assert.equal(inScope(spec, scopeOf([`${UI}src/x.test.ts`])), false, name);
  }
});

test('a change to shared code owes the specs named for no page, and leaves the page specs to main', () => {
  assert.deepEqual(owed([`${UI}src/hooks/useThing.ts`]), [matrix, dialogSpec]);
  assert.deepEqual(owed([`${UI}src/components/primitives/Button.tsx`]), [matrix, dialogSpec]);
  assert.deepEqual(owed([`${UI}src/components/tracks/TrackRow.tsx`]), [matrix, dialogSpec]);
});

test('a change to an overlay primitive or the shell owes every overlay guard row', () => {
  for (const file of [
    'src/components/primitives/Popover.tsx',
    'src/components/primitives/dialogClosed.ts',
    'src/overlay/layer.ts',
    'src/components/layout/AppShell.tsx',
  ]) {
    assert.deepEqual(owed([`${UI}${file}`]), [matrix, dialogSpec, editingOverlay, scriptOverlay], file);
  }
});

test('a changed spec file owes itself', () => {
  assert.deepEqual(owed([`${UI}tests/visual/proof-notes.spec.ts`]), [matrix, proofSpec]);
});

test('a unit test, a story or a doc draws nothing, so it owes only the matrix', () => {
  assert.deepEqual(owed([`${UI}src/components/booth/page/BoothNextPage.test.tsx`, `${UI}src/components/primitives/Button.stories.tsx`, 'README.md']), [matrix]);
});

test('anything else owes the whole suite: the suite’s own machinery, a config, a lockfile, a workflow, another project', () => {
  for (const file of [
    `${UI}tests/visual/lib/capture.ts`,
    `${UI}tests/visual/helpers/overlayGuardFor.ts`,
    `${UI}tests/visual/overlays/pages.ts`,
    `${UI}tests/visual/catalog/booth.ts`,
    `${UI}playwright.config.ts`,
    `${UI}package.json`,
    `${UI}index.html`,
    `${UI}src/styles.css`,
    `${UI}src/components/booth/booth.css`,
    `${UI}src/fixtures/book.json`,
    'pnpm-lock.yaml',
    '.github/workflows/_quality.yml',
    'scripts/ci/visual-shards.mjs',
    'config/defaults.json',
    'src/studio/desktop/app.go',
  ]) {
    assert.equal(scopeOf([file, `${UI}src/components/booth/x.tsx`]).everything, true, file);
  }
});

test('every page names folders that exist nowhere twice, and a spec word of its own', () => {
  const folders = PAGES.flatMap((page) => page.folders);
  assert.equal(new Set(folders).size, folders.length);
  assert.equal(new Set(PAGES.map((page) => page.spec)).size, PAGES.length);
});

test('describeScope counts what runs and what is left to main', () => {
  const scope = scopeOf([`${UI}src/components/booth/x.tsx`]);
  const kept = suite.filter((item) => inScope(item, scope));
  assert.equal(
    describeScope(scope, kept, suite),
    'visual scope: 3 of 6 tests (the state matrix; pages touched: booth; shared code: no). 3 tests of 2 spec files run on main after the merge.',
  );
  assert.match(describeScope(scopeOf(null), suite, suite), /the whole suite \(not a pull request/);
});

test('the engine panel is shared code: its specs drive other pages, and a change to it owes the specs named for no page', () => {
  const engineSpec = { file: 'engine-link-closes-overlay.spec.ts', loadFile: 'engine-link-closes-overlay.spec.ts', titlePath: ['x'] };
  assert.equal(
    PAGES.some((page) => page.spec === 'engine' || page.folders.includes('engine')),
    false,
  );
  for (const folder of ['proof', 'production', 'engine']) {
    assert.equal(inScope(engineSpec, scopeOf([`${UI}src/components/${folder}/x.tsx`])), true, folder);
  }
  assert.equal(scopeOf([`${UI}src/components/engine/EnginePanel.tsx`]).shared, true);
});

test('a spec is owed by every page its text names, not only by the page in its file name', () => {
  const text = "await goToPage(page, 'Pickups');\nawait expect(page.getByText('Master & QC')).toBeVisible(); // the Story Bible is not opened";
  assert.deepEqual(pagesNamedIn(text), ['master', 'pickups', 'storybible']);
  assert.deepEqual(pagesNamedIn("await page.goto('/settings/connection');"), ['settings']);
  assert.deepEqual(pagesNamedIn('const depth = 1;'), []);
  const boothLeave = { file: 'booth-leave-take-saved.spec.ts', loadFile: 'booth-leave-take-saved.spec.ts', titlePath: ['x'], names: ['booth', 'pickups'] };
  assert.equal(inScope(boothLeave, scopeOf([`${UI}src/components/pickups/PickupsPage.tsx`])), true);
  assert.equal(inScope(boothLeave, scopeOf([`${UI}src/components/booth/x.tsx`])), true);
  assert.equal(inScope(boothLeave, scopeOf([`${UI}src/components/delivery/x.tsx`])), false);
});

test('a change to the landing page owes every behaviour spec: a spec can stand on it without naming it', () => {
  const picker = { file: 'project-picker-back-focus.spec.ts', loadFile: 'project-picker-back-focus.spec.ts', titlePath: ['x'], names: ['project'] };
  const scope = scopeOf([`${UI}src/components/production/pipeline/PipelineTable.tsx`]);
  for (const spec of [picker, boothSpec, proofSpec, dialogSpec]) assert.equal(inScope(spec, scope), true, spec.file);
  assert.equal(inScope(scriptOverlay, scope), false, 'overlay rows follow their own page');
});

test('a page word inside a longer name still names the page', () => {
  assert.deepEqual(pagesNamedIn('await openSettings(page); mockProduction();'), ['production', 'settings']);
});

test('a page that draws another page’s code is touched by a change to it, however far down the imports', () => {
  const C = `${UI}src/components/`;
  const sources = new Map([
    [`${C}script/page/tools/text/readerText.ts`, 'export const READER_FONTS = [];'],
    [`${C}script/page/tools/text/index.ts`, "export * from './readerText';"],
    [`${C}booth/page/useTextChoices.ts`, "import { READER_FONTS } from '../../script/page/tools/text';"],
    [`${C}booth/frame/BoothTop.tsx`, "import { useTextChoices } from '../page/useTextChoices';"],
    [`${C}primitives/Popover.tsx`, "const lazy = import('../booth/frame/BoothTop');"],
    [`${C}delivery/Page.tsx`, "import { Button } from '../primitives/Button';"],
  ]);
  const changed = [`${C}script/page/tools/text/readerText.ts`];
  assert.deepEqual([...importersOf(changed, sources)].sort(), [
    `${C}booth/frame/BoothTop.tsx`,
    `${C}booth/page/useTextChoices.ts`,
    `${C}primitives/Popover.tsx`,
    `${C}script/page/tools/text/index.ts`,
    `${C}script/page/tools/text/readerText.ts`,
  ]);
  const scope = scopeOf(changed, sources);
  assert.deepEqual([...scope.pages].sort(), ['booth', 'script']);
  assert.equal(scope.overlays, true, 'an overlay primitive that imports the change owes every overlay row');
  assert.equal(inScope(boothSpec, scope), true);
  assert.equal(inScope(proofSpec, scope), false);
  assert.deepEqual([...scopeOf(changed).pages], ['script'], 'without the sources only the changed folder counts');
});
