// node --test src/studio/ui/scripts/*.test.mjs (the `test-node` target of src/studio/ui/project.json).
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { atlasDocs, checkAtlasDocs } from './atlas-docs.mjs';

const roots = [];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-docs-'));
  roots.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fx' }));
  mkdirSync(join(dir, 'src', 'components', 'primitives'), { recursive: true });
  for (const name of ['Button', 'Panel'])
    writeFileSync(join(dir, 'src', 'components', 'primitives', `${name}.tsx`), `export function ${name}() { return null; }\n`);
  return dir;
}
const out = (dir) => join(dir, 'docs', 'ui');
const run = (dir) => atlasDocs(dir, out(dir));
const inventoryOf = (dir) => JSON.parse(readFileSync(join(out(dir), 'inventory.json'), 'utf8')).components;
const indexWith = (dir, entries) => {
  mkdirSync(join(dir, 'storybook-static'), { recursive: true });
  writeFileSync(join(dir, 'storybook-static', 'index.json'), JSON.stringify({ v: 5, entries }));
};
const story = (id, title, name, componentPath) => ({ id, type: 'story', title, name, importPath: './x.stories.tsx', componentPath });

after(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('atlasDocs', () => {
  test('writes one page per component plus an inventory from index.json', async () => {
    const dir = fixture();
    indexWith(dir, {
      'primitives-button--primary': {
        id: 'primitives-button--primary',
        type: 'story',
        title: 'Primitives/Button',
        name: 'Primary',
        importPath: './src/components/primitives/Button.stories.tsx',
      },
      'primitives-button--ghost': {
        id: 'primitives-button--ghost',
        type: 'story',
        title: 'Primitives/Button',
        name: 'Ghost',
        importPath: './src/components/primitives/Button.stories.tsx',
      },
      'primitives-panel--default': {
        id: 'primitives-panel--default',
        type: 'story',
        title: 'Primitives/Panel',
        name: 'Default',
        importPath: './src/components/primitives/Panel.stories.tsx',
      },
    });
    writeFileSync(join(dir, 'src', 'Home.tsx'), "import { Button } from './components/primitives/Button';\nexport const Home = () => null;\n");
    const result = await run(dir);
    assert.equal(result.components, 2);
    assert.equal(result.stories, 3);
    const page = readFileSync(join(out(dir), 'atlas', 'Button.md'), 'utf8');
    assert.match(page, /# Button/);
    assert.match(page, /- Primary\n- Ghost/);
    assert.match(page, /`src\/Home.tsx`/);
    assert.deepEqual(
      inventoryOf(dir).map((c) => c.name),
      ['Button', 'Panel'],
    );
  });

  test('keeps hand-authored classification and entries that have no stories', async () => {
    const dir = fixture();
    indexWith(dir, {
      'primitives-panel--default': {
        id: 'primitives-panel--default',
        type: 'story',
        title: 'Primitives/Panel',
        name: 'Default',
        importPath: './src/components/primitives/Panel.stories.tsx',
      },
    });
    mkdirSync(out(dir), { recursive: true });
    writeFileSync(
      join(out(dir), 'inventory.json'),
      JSON.stringify({
        generatedBy: 'old',
        components: [
          { name: 'Panel', tier: 'primitive', depth: 'full', stories: ['stale'] },
          { name: 'Spacer', tier: 'exempt', atlasExempt: 'pure layout wrapper' },
        ],
      }),
    );
    await run(dir);
    const components = inventoryOf(dir);
    const panel = components.find((c) => c.name === 'Panel');
    assert.equal(panel.tier, 'primitive');
    assert.equal(panel.depth, 'full');
    assert.deepEqual(panel.stories, ['Default']);
    assert.equal(components.find((c) => c.name === 'Spacer').atlasExempt, 'pure layout wrapper');
  });

  test('says how to fix a missing build', async () => {
    await assert.rejects(run(fixture()), /run the storybook build/);
  });

  test('names a component after its file and finds kebab-case consumers', async () => {
    const dir = fixture();
    indexWith(dir, { 'x--a': story('x--a', 'Composites/No showtimes card/Empty', 'Empty', './src/components/movie-card.tsx') });
    writeFileSync(join(dir, 'src', 'page.tsx'), "import { MovieCard } from './components/movie-card';\n");
    await run(dir);
    const [component] = inventoryOf(dir);
    assert.equal(component.name, 'movie-card');
    assert.deepEqual(component.consumers, ['src/page.tsx']);
  });

  test('two story files for one component stay two pages instead of merging', async () => {
    const dir = fixture();
    indexWith(dir, {
      'a--one': story('a--one', 'Composites/MovieCard', 'One', './src/MovieCard.tsx'),
      'b--two': story('b--two', 'Composites/MovieCardNoShowtimes', 'Two', './src/MovieCard.tsx'),
    });
    const result = await run(dir);
    assert.equal(result.components, 2);
    const names = inventoryOf(dir).map((c) => c.name);
    assert.equal(new Set(names).size, 2, 'page names must be unique');
    assert.ok(names.includes('MovieCard'));
  });

  test('deletes generated pages and images it no longer produces, but not other files', async () => {
    const dir = fixture();
    indexWith(dir, { 'a--one': story('a--one', 'Primitives/Button', 'One', './src/Button.tsx') });
    mkdirSync(join(out(dir), 'atlas'), { recursive: true });
    mkdirSync(join(out(dir), 'images'), { recursive: true });
    writeFileSync(join(out(dir), 'atlas', 'Gone.md'), '# stale');
    writeFileSync(join(out(dir), 'images', 'gone.webp'), 'x');
    writeFileSync(join(out(dir), 'README.md'), 'hand written');
    await run(dir);
    assert.equal(existsSync(join(out(dir), 'atlas', 'Gone.md')), false);
    assert.equal(existsSync(join(out(dir), 'images', 'gone.webp')), false);
    assert.equal(existsSync(join(out(dir), 'README.md')), true);
  });

  test('adopts the casing of an existing curated inventory instead of duplicating it', async () => {
    const dir = fixture();
    indexWith(dir, { 'a--one': story('a--one', 'Sections/feature-grid', 'One', './src/feature-grid.tsx') });
    mkdirSync(out(dir), { recursive: true });
    writeFileSync(join(out(dir), 'inventory.json'), JSON.stringify({ components: [{ name: 'FeatureGrid', tier: 'composite' }] }));
    await run(dir);
    const components = inventoryOf(dir);
    assert.equal(components.length, 1);
    assert.equal(components[0].name, 'FeatureGrid');
    assert.equal(components[0].tier, 'composite');
    assert.equal(existsSync(join(out(dir), 'atlas', 'FeatureGrid.md')), true);
  });
});

describe('checkAtlasDocs', () => {
  const button = { id: 'b--p', type: 'story', title: 'Primitives/Button', name: 'Primary', importPath: './src/components/primitives/Button.stories.tsx' };

  test('is empty right after a generation, with or without an image line', async () => {
    const dir = fixture();
    indexWith(dir, { 'b--p': button });
    await run(dir);
    assert.deepEqual(await checkAtlasDocs(dir, out(dir)), []);
    const page = join(out(dir), 'atlas', 'Button.md');
    writeFileSync(page, readFileSync(page, 'utf8').replace('## Stories', '![Button, Primary, light theme](../images/button.webp)\n\n## Stories'));
    assert.deepEqual(await checkAtlasDocs(dir, out(dir)), []);
  });

  test('names a hand-edited page, a missing page, a stale page and a changed inventory', async () => {
    const dir = fixture();
    indexWith(dir, { 'b--p': button });
    await run(dir);
    writeFileSync(join(out(dir), 'atlas', 'Button.md'), '# Button\n\nedited by hand\n');
    writeFileSync(join(out(dir), 'atlas', 'Gone.md'), '# Gone\n');
    rmSync(join(out(dir), 'atlas', 'index.md'));
    const inventory = JSON.parse(readFileSync(join(out(dir), 'inventory.json'), 'utf8'));
    inventory.components[0].stories = ['Other'];
    writeFileSync(join(out(dir), 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
    const diffs = await checkAtlasDocs(dir, out(dir));
    assert.deepEqual(
      diffs.map((d) => d.split(':')[0]),
      ['atlas/Button.md', 'atlas/Gone.md', 'atlas/index.md', 'inventory.json'],
    );
  });

  test('keeps the hand-written inventory fields', async () => {
    const dir = fixture();
    indexWith(dir, { 'b--p': button });
    await run(dir);
    const inventory = JSON.parse(readFileSync(join(out(dir), 'inventory.json'), 'utf8'));
    inventory.components[0].tier = 'primitive';
    writeFileSync(join(out(dir), 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
    assert.deepEqual(await checkAtlasDocs(dir, out(dir)), []);
  });
});
