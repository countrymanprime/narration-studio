import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guidePages, orphans, samePicture, selectEntries } from '../dev/guide-screenshots.mjs';

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
