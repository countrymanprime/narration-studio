import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { captureSource, guidePages, loadSharp, main, orphans, samePicture, selectEntries } from '../dev/guide-screenshots.mjs';

const manifest = [
  { page: 'booth', state: 'setup', viewport: 'desktop', docName: 'booth-setup' },
  { page: 'storybible', state: 'characters', viewport: 'desktop', docName: 'storybible-characters' },
  { page: 'delivery', state: 'default', viewport: 'desktop', docName: 'delivery-default' },
];
const pages = guidePages([
  ['booth.md', 'Intro\n\n![Booth before a take](../../images/ui/booth-setup.webp)\n'],
  ['story-bible.md', '![Characters](../../images/ui/storybible-characters.webp)'],
  ['delivery.md', '![Delivery](../../images/ui/delivery-default.webp) and a [link](../../images/ui/not-an-embed.webp)'],
]);

test('guidePages maps each embedded docName to the guide page that embeds it', () => {
  assert.deepEqual(Object.fromEntries(pages), { 'booth-setup': 'booth', 'storybible-characters': 'story-bible', 'delivery-default': 'delivery' });
});

test('selectEntries takes a guide page or a state-catalog page', () => {
  assert.deepEqual(selectEntries(manifest, pages, ['story-bible']).map((e) => e.docName), ['storybible-characters']);
  assert.deepEqual(selectEntries(manifest, pages, ['storybible', 'booth']).map((e) => e.docName), ['booth-setup', 'storybible-characters']);
});

test('selectEntries refuses a name that owns no guide image', () => {
  assert.throws(() => selectEntries(manifest, pages, ['booth', 'shedule']), /no guide image belongs to shedule/);
});

test('orphans lists the WebP files no manifest entry names', () => {
  assert.deepEqual(orphans(['booth-setup.webp', 'proof-old.webp', 'README.md'], manifest), ['proof-old.webp']);
});

const image = (width, height, fill) => ({ info: { width, height }, data: Buffer.alloc(width * height * 4, fill) });

test('samePicture ignores a few anti-aliased pixels and catches a real change', () => {
  const a = image(100, 100, 200);
  const speck = image(100, 100, 200);
  speck.data[0] = 0;
  assert.equal(samePicture(a, speck), true);
  const band = image(100, 100, 200);
  band.data.fill(0, 0, 100 * 4 * 2);
  assert.equal(samePicture(a, band), false);
  assert.equal(samePicture(a, image(100, 101, 200)), false);
});

// The command itself, on a throwaway guide, manifest, capture folder and image folder. These replace the
// pr-screenshots tests of the file and image helpers (collectVisual, stageImages) with the same behaviours in the
// guide tool: reading the PNG a run left for each entry, writing the converted image, and the exit code on failure.
// Removed with no successor: prImageName and markdownFor (a PR no longer carries a named image set or a SHA-pinned
// table) and collectAtlas (the Storybook atlas images are no longer staged for a PR).
const sharp = loadSharp();

async function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'guide-shots-'));
  const env = { ui: join(root, 'ui'), guide: join(root, 'guide'), images: join(root, 'images'), manifest: join(root, 'doc-screenshots.json'), capture: () => true };
  mkdirSync(env.guide, { recursive: true });
  mkdirSync(env.images, { recursive: true });
  writeFileSync(env.manifest, JSON.stringify(manifest));
  writeFileSync(join(env.guide, 'booth.md'), '![Booth](../../images/ui/booth-setup.webp)');
  return env;
}

async function capturePng(env, entry, fill) {
  const file = captureSource(env.ui, entry);
  mkdirSync(dirname(file), { recursive: true });
  await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: fill, g: fill, b: fill } } }).png().toFile(file);
}

const silently = async (run) => {
  const { log, error } = console;
  console.log = console.error = () => {};
  try {
    return await run();
  } finally {
    Object.assign(console, { log, error });
  }
};

test('captureSource names the light-theme PNG of a state and viewport under the capture folder', () => {
  assert.equal(captureSource('/ui', manifest[0]), join('/ui', 'screenshots/guide/light/booth/setup/desktop.png'));
});

test('main with no page and no --all prints usage and exits 2', async () => {
  const env = await workspace();
  assert.equal(await silently(() => main([], env)), 2);
  assert.equal(await silently(() => main(['--skip-run'], env)), 2);
});

test('main refuses a page that owns no guide image', async () => {
  const env = await workspace();
  await assert.rejects(silently(() => main(['shedule', '--skip-run'], env)), /no guide image belongs to shedule/);
});

test('main writes each listed capture as a WebP named by its docName, and only those', async () => {
  const env = await workspace();
  await capturePng(env, manifest[0], 120);
  assert.equal(await silently(() => main(['booth', '--skip-run'], env)), 0);
  assert.deepEqual(readdirSync(env.images), ['booth-setup.webp']);
  assert.equal((await sharp(join(env.images, 'booth-setup.webp')).metadata()).format, 'webp');
});

test('main leaves an image whose pixels did not change untouched and replaces one that did', async () => {
  const env = await workspace();
  const target = join(env.images, 'booth-setup.webp');
  await capturePng(env, manifest[0], 120);
  await silently(() => main(['booth', '--skip-run'], env));
  const first = statSync(target).mtimeMs;
  await new Promise((done) => setTimeout(done, 20));
  await silently(() => main(['booth', '--skip-run'], env));
  assert.equal(statSync(target).mtimeMs, first);
  await capturePng(env, manifest[0], 30);
  await silently(() => main(['booth', '--skip-run'], env));
  assert.ok(statSync(target).mtimeMs > first);
});

test('main exits 1 and writes nothing for an entry with no capture', async () => {
  const env = await workspace();
  assert.equal(await silently(() => main(['booth', '--skip-run'], env)), 1);
  assert.deepEqual(readdirSync(env.images), []);
});

test('main exits 1 when the capture run fails, after converting what it did leave', async () => {
  const env = await workspace();
  await capturePng(env, manifest[0], 120);
  assert.equal(await silently(() => main(['booth'], { ...env, capture: () => false })), 1);
  assert.deepEqual(readdirSync(env.images), ['booth-setup.webp']);
});

test('main runs the capture for the state-catalog pages of the entries it selected', async () => {
  const env = await workspace();
  let asked;
  await silently(() => main(['booth'], { ...env, capture: (pages) => ((asked = pages), true) }));
  assert.deepEqual(asked, ['booth']);
});
