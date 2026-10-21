import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildGuides, GROUPS, parsePage, renderPage, slug } from './guides.mjs';
import { REPO } from './shell.mjs';
import { outwardHtmlLoads } from './siteFiles.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const listed = GROUPS.flatMap((group) => group.pages);

test('a heading gets the id GitHub gives it', () => {
  assert.equal(slug('Master & QC: a "test"'), 'master--qc-a-test');
  assert.equal(slug('One chapter'), 'one-chapter');
});

test('front matter needs a title and a lead', () => {
  assert.deepEqual(parsePage('---\ntitle: T\nlead: L: more\n---\nbody\n', 'x'), { meta: { title: 'T', lead: 'L: more' }, markdown: 'body\n' });
  assert.throws(() => parsePage('no front matter', 'x'), /no front matter/);
  assert.throws(() => parsePage('---\ntitle: T\n---\n', 'x'), /no lead/);
});

test('links, images, notes and tables become the mock blocks, and a dead link or a missing image throws', () => {
  const { html, headings, images, links } = renderPage(
    '## One step\n\n[a](proof.md#one-chapter) [b](../../../docs/utilities/recording-coverage.md#x) [c](https://example.com)\n\n![Alt](../../../docs/images/ui/pickups-list.webp "Caption")\n\n> **Note:** Kept.\n\n| A | B |\n| - | - |\n| 1 | 2 |\n',
    'pickups',
    listed,
    root,
  );
  assert.deepEqual(headings, [{ id: 'one-step', text: 'One step' }]);
  assert.match(html, /<h2 id="one-step">One step<a class="anchor" href="#one-step"/);
  assert.match(html, /href="proof\.html#one-chapter"/);
  assert.ok(html.includes(`href="${REPO}/blob/main/docs/utilities/recording-coverage.md#x"`));
  assert.match(html, /<figure class="fig"><img src="images\/pickups-list\.webp" alt="Alt" loading="lazy"><figcaption>Caption<\/figcaption><\/figure>/);
  assert.match(html, /<div class="note"><svg[^>]*>.*<\/svg><div>Kept\.<\/div><\/div>/);
  assert.match(html, /<div class="tbl"><table>/);
  assert.deepEqual(images, ['pickups-list.webp']);
  assert.deepEqual(links, [{ page: 'proof', hash: 'one-chapter' }]);
  assert.throws(() => renderPage('[x](nowhere.md)', 'pickups', listed, root), /names no docs page/);
  assert.throws(() => renderPage('[x](../../../docs/nowhere.md)', 'pickups', listed, root), /does not exist/);
  assert.throws(() => renderPage('![x](../../../docs/images/ui/missing.webp)', 'pickups', listed, root), /does not exist/);
  assert.throws(() => renderPage('![x](../../../README.md)', 'pickups', listed, root), /is not in docs\/images\/ui/);
  assert.throws(() => renderPage('# Title', 'pickups', listed, root), /front matter/);
});

// A copy of the repository's docs sources in a scratch root, so a test can break one without touching the real files.
function scratchRoot(change) {
  const scratch = mkdtempSync(join(tmpdir(), 'docs-root-'));
  for (const dir of ['apps/site/docs', 'docs/guides/using-the-app', 'docs/images/ui']) cpSync(join(root, dir), join(scratch, dir), { recursive: true });
  change(join(scratch, 'apps', 'site', 'docs'));
  return scratch;
}

test('the build throws on a page no group lists, a dead heading and a missing image', () => {
  const out = mkdtempSync(join(tmpdir(), 'docs-out-'));
  const unlisted = scratchRoot((dir) => writeFileSync(join(dir, 'stray.md'), '---\ntitle: S\nlead: L\n---\n'));
  assert.throws(() => buildGuides({ root: unlisted, out, withStorybook: true }), /stray\.md is in no group/);
  const missing = scratchRoot((dir) => writeFileSync(join(dir, 'proof.md'), '---\ntitle: P\nlead: L\n---\n![x](../../../docs/images/ui/gone.webp)\n'));
  assert.throws(() => buildGuides({ root: missing, out, withStorybook: true }), /does not exist/);
  const heading = scratchRoot((dir) => writeFileSync(join(dir, 'schedule.md'), '---\ntitle: S\nlead: L\n---\n[x](proof.md#no-such-heading)\n'));
  assert.throws(() => buildGuides({ root: heading, out, withStorybook: true }), /names no heading/);
});

test('every docs page builds in the shell, and its links, anchors and images resolve with nothing loaded from outside', () => {
  const out = mkdtempSync(join(tmpdir(), 'docs-'));
  const { pages, images } = buildGuides({ root, out, withStorybook: true });
  assert.deepEqual(
    pages.map((p) => p.page),
    listed,
  );
  assert.ok(images.length >= listed.length);
  const ids = Object.fromEntries(
    listed.map((page) => [page, new Set([...readFileSync(join(out, 'docs', `${page}.html`), 'utf8').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))]),
  );
  for (const page of listed) {
    const html = readFileSync(join(out, 'docs', `${page}.html`), 'utf8');
    assert.deepEqual(outwardHtmlLoads(html), [], page);
    assert.match(html, /<nav class="side" id="doc-side" aria-label="Documentation">/);
    assert.match(html, /Full guide on GitHub/);
    assert.doesNotMatch(html, /sha256|\bMIT\b/i, page);
    for (const [, href] of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
      if (/^(https?:|data:)/.test(href) || href.startsWith('../')) continue;
      const [file, hash] = href.split('#');
      const target = file === '' ? page : file.replace(/\.html$/, '');
      assert.ok(listed.includes(target), `${page}: ${href} names no docs page`);
      if (hash) assert.ok(ids[target].has(hash), `${page}: ${href} has no such heading`);
    }
    for (const [, src] of html.matchAll(/<img [^>]*src="([^"]+)"/g)) assert.ok(existsSync(join(out, 'docs', src)), `${page}: ${src}`);
  }
  assert.deepEqual(readdirSync(join(out, 'docs', 'images')).sort(), images);
});
