#!/usr/bin/env node
// Regenerates the screenshots of the how-to guide (docs/guides/using-the-app/) from the real app. The guide's pictures are
// listed in apps/ui/tests/visual/doc-screenshots.json, one entry per image: a state-catalog row, a viewport and the
// docName the guide embeds as docs/images/ui/<docName>.webp. For the pages named, this runs the targeted real-app run
// (apps/ui `visual:page`, light theme: the mock API and the visual-suite drivers), converts each listed state to WebP and
// replaces the file in place. An image whose pixels did not change is left untouched, so the diff holds only what moved.
//
//   node scripts/dev/guide-screenshots.mjs <page>... [--skip-run]
//   node scripts/dev/guide-screenshots.mjs --all [--skip-run]
//
// <page> is a guide page (booth, master-and-qc, story-bible) or a state-catalog page (storybible, proof-chapter).
// --skip-run converts what the last run left in apps/ui/screenshots/guide/. It ends with the size of docs/images/ui and
// any image there that the manifest no longer lists (delete it, or add it to the manifest and embed it).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../..');
const UI = join(ROOT, 'apps/ui');
const GUIDE = join(ROOT, 'docs/guides/using-the-app');
const IMAGES = join(ROOT, 'docs/images/ui');
const MANIFEST = join(UI, 'tests/visual/doc-screenshots.json');
const CAPTURES = 'screenshots/guide';

// The guide is read well under full desktop width; downscale before compressing so text-heavy pages stay small.
export const WEBP = { quality: 80, maxWidth: 1280 };
// Two encodings of the same state differ by a few anti-aliased pixels from run to run; under this share of pixels
// changed by more than PIXEL_DELTA levels the image counts as unchanged and the committed file stays.
const CHANGED_SHARE = 0.0005;
const PIXEL_DELTA = 16;

const EMBED = /!\[[^\]]*\]\(\.\.\/\.\.\/images\/ui\/([^)\s]+)\.webp\)/g;

/** docName -> guide page (file name without .md), from the embeds in the guide's Markdown. */
export function guidePages(files) {
  const pages = new Map();
  for (const [file, markdown] of files) {
    for (const match of markdown.matchAll(EMBED)) pages.set(match[1], basename(file, '.md'));
  }
  return pages;
}

/** The manifest entries the named pages own: a name matches an entry's state-catalog page or the guide page embedding it. */
export function selectEntries(manifest, pages, names) {
  const unknown = names.filter((name) => !manifest.some((entry) => entry.page === name || pages.get(entry.docName) === name));
  if (unknown.length > 0) throw new Error(`no guide image belongs to ${unknown.join(', ')}: name a guide page or a state-catalog page`);
  return manifest.filter((entry) => names.includes(entry.page) || names.includes(pages.get(entry.docName)));
}

/** Images in docs/images/ui that no manifest entry names. */
export function orphans(imageFiles, manifest) {
  const listed = new Set(manifest.map((entry) => `${entry.docName}.webp`));
  return imageFiles.filter((file) => file.endsWith('.webp') && !listed.has(file));
}

/** True when two decoded RGBA images of the same size differ in fewer than CHANGED_SHARE of their pixels. */
export function samePicture(a, b) {
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return false;
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const delta = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (delta > PIXEL_DELTA) changed += 1;
  }
  return changed / (a.info.width * a.info.height) < CHANGED_SHARE;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

async function main(argv) {
  const all = argv.includes('--all');
  const skipRun = argv.includes('--skip-run');
  const names = argv.filter((arg) => !arg.startsWith('--'));
  if (!all && names.length === 0) {
    console.error('usage: node scripts/dev/guide-screenshots.mjs <page>... | --all [--skip-run]');
    return 2;
  }
  const sharp = createRequire(join(UI, 'package.json'))('sharp');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const guideFiles = readdirSync(GUIDE)
    .filter((file) => file.endsWith('.md'))
    .map((file) => [file, readFileSync(join(GUIDE, file), 'utf8')]);
  const entries = all ? manifest : selectEntries(manifest, guidePages(guideFiles), names);
  const catalogPages = [...new Set(entries.map((entry) => entry.page))];

  let failed = false;
  if (!skipRun) {
    const run = spawnSync('pnpm', ['--dir', UI, 'visual:page', ...catalogPages, '--themes', 'light', '--out', CAPTURES], { cwd: ROOT, stdio: 'inherit' });
    if (run.status !== 0) {
      failed = true;
      console.error('\nvisual:page failed: a failing state still wrote its PNG; look at it before you commit the image.');
    }
  }

  const counts = { updated: 0, added: 0, unchanged: 0 };
  const missing = [];
  for (const entry of entries) {
    const source = join(UI, CAPTURES, 'light', entry.page, entry.state, `${entry.viewport}.png`);
    if (!existsSync(source)) {
      missing.push(`${entry.page}/${entry.state}/${entry.viewport} (${entry.docName})`);
      continue;
    }
    const target = join(IMAGES, `${entry.docName}.webp`);
    const webp = await sharp(source).resize({ width: WEBP.maxWidth, withoutEnlargement: true }).webp({ quality: WEBP.quality }).toBuffer();
    const before = existsSync(target) ? readFileSync(target) : undefined;
    if (before) {
      const [a, b] = await Promise.all([before, webp].map((buffer) => sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
      if (before.equals(webp) || samePicture(a, b)) {
        counts.unchanged += 1;
        continue;
      }
    }
    writeFileSync(target, webp);
    counts[before ? 'updated' : 'added'] += 1;
    console.log(`${before ? 'updated' : 'added  '} ${entry.docName}.webp ${before ? `${kb(before.length)} -> ` : ''}${kb(webp.length)}`);
  }

  const images = readdirSync(IMAGES);
  const total = images.reduce((sum, file) => sum + statSync(join(IMAGES, file)).size, 0);
  console.log(`\n${counts.updated} updated, ${counts.added} added, ${counts.unchanged} unchanged; docs/images/ui holds ${images.length} files, ${kb(total)}.`);
  for (const file of orphans(images, manifest)) console.log(`not in doc-screenshots.json: docs/images/ui/${file} (delete it, or list and embed it)`);
  if (missing.length > 0) {
    console.error(`\nno capture for:\n  ${missing.join('\n  ')}\nIs the state in apps/ui/tests/visual/state-catalog.ts at that viewport?`);
    failed = true;
  }
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(await main(process.argv.slice(2)));
