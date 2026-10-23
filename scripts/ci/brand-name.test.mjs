import assert from 'node:assert/strict';
import test from 'node:test';

import { loadBrand, nameForms } from '../brand/brand.mjs';
import { checkTracked, namePattern } from './brand-name.mjs';

// A made-up brand, so the cases below hold whatever the product is called. Its name is assembled here, so this file holds no
// spelling of it and still passes once a rename (or the CI rehearsal) makes it the real name.
const WORDS = ['Zebra', 'Audio', 'Lab'];
const NAME = WORDS.join(' ');
const { slug, snake, constant, pascal } = nameForms(NAME);
const real = loadBrand();
const brand = {
  ...real,
  name: NAME,
  repository: { ...real.repository, owner: 'stripes', name: slug },
  identity: { ...real.identity, reaperLauncher: `${pascal}_Launcher.lua`, reaperResourceFolder: pascal },
};
const check = (texts, allow = new Map()) => checkTracked(brand, [...texts.keys()], texts, allow);

test('no tracked file holds the product name outside the brand file, its outputs and the allowlist', () => {
  assert.deepEqual(checkTracked(), []);
});

test('every spelling of the name is found, also across a wrapped line', () => {
  for (const text of [NAME, slug, snake, constant, pascal, WORDS.join('.').toLowerCase(), `${WORDS[0]}\n// ${WORDS.slice(1).join(' ')}`]) {
    assert.equal([...`see ${text} here`.matchAll(namePattern(NAME))].length, 1, JSON.stringify(text));
  }
  for (const text of [WORDS.slice(0, 2).join(' '), `${WORDS.slice(0, 2).join(' ')} Library`, `${WORDS[0]}s ${WORDS.slice(1).join(' ')}`]) {
    assert.equal([...text.matchAll(namePattern(NAME))].length, 0, text);
  }
});

test('the name in a file is reported with its line, and in a path', () => {
  assert.deepEqual(check(new Map([['docs/a.md', `one\nOpen ${NAME}.\n`]])), [`docs/a.md:2: Open ${NAME}.`]);
  assert.deepEqual(check(new Map([[`docs/${slug}.md`, '']])), [`docs/${slug}.md: the path holds the product name`]);
});

test('brand regions, repository addresses, the Pages sub-path and identity file names are not judged', () => {
  const text = [
    `Open <!-- brand:name -->${NAME}<!-- /brand -->.`,
    `https://github.com/stripes/${slug}/issues and git@github.com:stripes/${slug}.git`,
    `https://stripes.github.io/${slug}/ and stripes/${slug}`,
    `serve --base /${slug}/`,
    `copy ${pascal}_Launcher.lua and ${pascal}_Startup.lua`,
  ].join('\n');
  assert.deepEqual(check(new Map([['docs/a.md', text]])), []);
  assert.deepEqual(check(new Map([[`src/reaper/${pascal}_Launcher.lua`, '']])), []);
});

test('the brand file, the files sync writes and an allowed folder may hold it', () => {
  const texts = new Map([
    ['config/brand.json', NAME],
    ['src/studio/ui/src/brand.gen.ts', NAME],
    ['docs/history/old.md', NAME],
  ]);
  assert.deepEqual(check(texts, new Map([['docs/history/', 'dated']])), []);
});
