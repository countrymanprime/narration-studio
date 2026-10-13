import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { globToRegExp } from './docs-impact.mjs';
import { evaluate, findOptOut, loadMap } from './guide-impact.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = loadMap();

test('a page change with neither its guide page nor an image fails, naming the guide page', () => {
  const { violations } = evaluate({ changed: ['apps/ui/src/components/booth/frame/LevelsMenu.tsx'], map });
  assert.deepEqual(violations, [{ id: 'booth', files: ['apps/ui/src/components/booth/frame/LevelsMenu.tsx'], guide: ['booth.md'] }]);
});

test('the guide page or any guide image satisfies the rule', () => {
  const code = 'apps/ui/src/components/settings/page/SettingsPage.tsx';
  assert.deepEqual(evaluate({ changed: [code, 'docs/guides/using-the-app/settings.md'], map }).violations, []);
  assert.deepEqual(evaluate({ changed: [code, 'docs/images/ui/settings-general.webp'], map }).violations, []);
  assert.equal(evaluate({ changed: [code, 'docs/guides/using-the-app/booth.md'], map }).violations.length, 1);
});

test('tests, stories, fixtures and unmapped folders owe nothing', () => {
  const changed = [
    'apps/ui/src/components/booth/page/BoothNextPage.test.tsx',
    'apps/ui/src/components/script/page/ScriptPage.stories.tsx',
    'apps/ui/src/components/primitives/Dialog.tsx',
    'apps/ui/tests/visual/drivers/booth.ts',
  ];
  assert.deepEqual(evaluate({ changed, map }).violations, []);
});

test('a specific No guide change line waives it; a vague one does not', () => {
  const changed = ['apps/ui/src/components/proof/ProofPage.tsx'];
  const text = 'Body\n\nNo guide change: renames a prop, nothing on screen moves\n';
  assert.equal(evaluate({ changed, map, text }).waivedBy, 'renames a prop, nothing on screen moves');
  assert.equal(findOptOut('No guide change: n/a'), undefined);
  assert.equal(findOptOut('No guide change: minor'), undefined);
  assert.equal(evaluate({ changed, map, text: 'No guide change: none' }).violations.length, 1);
});

test('every rule names UI folders and guide pages that exist', () => {
  const guide = readdirSync(join(ROOT, 'docs/guides/using-the-app'));
  for (const rule of map.rules) {
    for (const path of rule.paths) assert.ok(existsSync(join(ROOT, path.replace(/\/\*\*$/, ''))), `${rule.id}: ${path} does not exist`);
    for (const page of rule.guide) assert.ok(guide.some((file) => globToRegExp(page).test(file)), `${rule.id}: no guide page ${page}`);
  }
});

test('every page folder under apps/ui/src/components has a rule, or is listed as shared', () => {
  const shared = new Set(['primitives', 'devtools']);
  const mapped = new Set(map.rules.flatMap((rule) => rule.paths.map((path) => path.split('/')[4])));
  const folders = readdirSync(join(ROOT, 'apps/ui/src/components'), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const missing = folders.map((entry) => entry.name).filter((name) => !mapped.has(name) && !shared.has(name));
  assert.deepEqual(missing, [], 'add a rule to scripts/ci/guide-impact-map.json for the new folder, or list it as shared here');
});
