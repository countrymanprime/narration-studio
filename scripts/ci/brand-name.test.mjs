import assert from 'node:assert/strict';
import test from 'node:test';

import { loadBrand } from '../brand/brand.mjs';
import { checkTracked, namePattern } from './brand-name.mjs';

// A made-up brand, so the cases below hold whatever the product is called.
const real = loadBrand();
const brand = {
  ...real,
  name: 'Zebra Audio Lab',
  repository: { ...real.repository, owner: 'stripes', name: 'zebra-audio-lab' },
  identity: { ...real.identity, reaperLauncher: 'ZebraAudioLab_Launcher.lua', reaperResourceFolder: 'ZebraAudioLab' },
};
const check = (texts, allow = new Map()) => checkTracked(brand, [...texts.keys()], texts, allow);

test('no tracked file holds the product name outside the brand file, its outputs and the allowlist', () => {
  assert.deepEqual(checkTracked(), []);
});

test('every spelling of the name is found, also across a wrapped line', () => {
  for (const text of ['Zebra Audio Lab', 'zebra-audio-lab', 'zebra_audio_lab', 'ZebraAudioLab', 'ZEBRA_AUDIO_LAB', 'zebra.audio.lab', 'Zebra\n// Audio Lab']) {
    assert.equal([...`see ${text} here`.matchAll(namePattern(brand.name))].length, 1, JSON.stringify(text));
  }
  for (const text of ['Zebra Audio', 'Zebra Audio Library', 'zebras audio lab']) {
    assert.equal([...text.matchAll(namePattern(brand.name))].length, 0, text);
  }
});

test('the name in a file is reported with its line, and in a path', () => {
  assert.deepEqual(check(new Map([['docs/a.md', 'one\nOpen Zebra Audio Lab.\n']])), ['docs/a.md:2: Open Zebra Audio Lab.']);
  assert.deepEqual(check(new Map([['docs/zebra-audio-lab.md', '']])), ['docs/zebra-audio-lab.md: the path holds the product name']);
});

test('brand regions, repository addresses, the Pages sub-path and identity file names are not judged', () => {
  const text = [
    'Open <!-- brand:name -->Zebra Audio Lab<!-- /brand -->.',
    'https://github.com/stripes/zebra-audio-lab/issues and git@github.com:stripes/zebra-audio-lab.git',
    'https://stripes.github.io/zebra-audio-lab/ and stripes/zebra-audio-lab',
    'serve --base /zebra-audio-lab/',
    'copy ZebraAudioLab_Launcher.lua and ZebraAudioLab_Startup.lua',
  ].join('\n');
  assert.deepEqual(check(new Map([['docs/a.md', text]])), []);
  assert.deepEqual(check(new Map([['src/reaper/ZebraAudioLab_Launcher.lua', '']])), []);
});

test('the brand file, the files sync writes and an allowed folder may hold it', () => {
  const texts = new Map([
    ['config/brand.json', 'Zebra Audio Lab'],
    ['src/studio/ui/src/brand.gen.ts', 'Zebra Audio Lab'],
    ['docs/history/old.md', 'Zebra Audio Lab'],
  ]);
  assert.deepEqual(check(texts, new Map([['docs/history/', 'dated']])), []);
});
