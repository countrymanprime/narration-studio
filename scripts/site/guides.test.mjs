import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildGuides, GROUPS, renderGuide, slug } from './guides.mjs';
import { outwardHtmlLoads } from './siteFiles.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

test('a heading gets the id GitHub gives it', () => {
  assert.equal(slug('Master & QC: a "test"'), 'master--qc-a-test');
  assert.equal(slug('One chapter'), 'one-chapter');
});

test('links to other guides, repo files and images are rewritten, and a dead one throws', () => {
  const known = ['proof', 'README'];
  const { body, images } = renderGuide(
    '# T\n\n[a](proof.md#one-chapter) [b](README.md) [c](../../utilities/recording-coverage.md#the-model-cascade)\n\n![x](../../images/ui/pickups-list.webp)\n',
    'pickups',
    known,
  );
  assert.match(body, /href="proof\.html#one-chapter"/);
  assert.match(body, /href="index\.html"/);
  assert.match(body, /href="https:\/\/github\.com\/countrymanprime\/narration-utils\/blob\/main\/docs\/utilities\/recording-coverage\.md#the-model-cascade"/);
  assert.match(body, /src="images\/pickups-list\.webp"/);
  assert.deepEqual(images, ['pickups-list.webp']);
  assert.throws(() => renderGuide('[x](nowhere.md)', 'pickups', known), /does not exist/);
  assert.throws(() => renderGuide('![x](../../images/ui/missing.webp)', 'pickups', known), /does not exist/);
});

test('every guide builds to a page whose links, anchors and images resolve', () => {
  const out = mkdtempSync(join(tmpdir(), 'guides-'));
  const { pages, images } = buildGuides({ root, out, withStorybook: true, icon: 'data:,' });
  assert.ok(pages.includes('index'));
  for (const page of GROUPS.flatMap((group) => group.pages)) assert.ok(pages.includes(page), page);
  assert.ok(images.length > 50);
  const ids = Object.fromEntries(
    pages.map((page) => [page, new Set([...readFileSync(join(out, 'guides', `${page}.html`), 'utf8').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))]),
  );
  for (const page of pages) {
    const html = readFileSync(join(out, 'guides', `${page}.html`), 'utf8');
    assert.deepEqual(outwardHtmlLoads(html), [], page);
    for (const [, href] of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
      if (/^(https?:|data:)/.test(href) || href.startsWith('../')) continue;
      const [file, hash] = href.split('#');
      const target = file === '' ? page : file.replace(/\.html$/, '');
      assert.ok(pages.includes(target), `${page}: ${href} names no guide`);
      if (hash) assert.ok(ids[target].has(hash), `${page}: ${href} has no such heading`);
    }
    for (const [, src] of html.matchAll(/<img [^>]*src="([^"]+)"/g)) assert.ok(existsSync(join(out, 'guides', src)), `${page}: ${src}`);
  }
  assert.deepEqual(readdirSync(join(out, 'guides', 'images')).sort(), images);
});
