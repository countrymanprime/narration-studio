import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { collectAtlas, collectVisual, markdownFor, prImageName, stageImages } from '../dev/pr-screenshots.mjs';

function touch(root, ...parts) {
  const file = join(root, ...parts);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, 'png');
}

test('prImageName is <page>-<state>-<viewport>-<theme>.png', () => {
  assert.equal(prImageName({ page: 'settings', state: 'dirty-footer', viewport: 'reflow', theme: 'dark' }), 'settings-dirty-footer-reflow-dark.png');
});

test('collectVisual reads every theme/page/state/viewport PNG and ignores other files', () => {
  const root = mkdtempSync(join(tmpdir(), 'targeted-'));
  touch(root, 'light', 'script', 'find', 'desktop.png');
  touch(root, 'dark', 'script', 'find', 'tablet.png');
  touch(root, 'dark', 'script', 'find', 'notes.txt');
  const rows = collectVisual(root, ['script']);
  assert.deepEqual(rows.map((r) => `${r.page}/${r.state}/${r.viewport}/${r.theme}`).sort(), ['script/find/desktop/light', 'script/find/tablet/dark']);
});

test('collectAtlas names a story image storybook-<title>-<story>-<viewport>-<theme>', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-'));
  touch(root, 'editing-ribbon', 'default--dark-narrow.png');
  const [row] = collectAtlas(root);
  assert.equal(prImageName(row), 'storybook-editing-ribbon-default-narrow-dark.png');
  assert.equal(row.page, 'storybook-editing-ribbon');
});

test('stageImages copies every row into the slice folder under its name', () => {
  const src = mkdtempSync(join(tmpdir(), 'targeted-'));
  touch(src, 'light', 'script', 'find', 'desktop.png');
  const dest = join(mkdtempSync(join(tmpdir(), 'pr-')), 'slice');
  const rows = collectVisual(src, ['script']);
  stageImages(rows, dest);
  assert.deepEqual(readdirSync(dest), ['script-find-desktop-light.png']);
});

test('markdownFor embeds each image by commit SHA, light beside dark', () => {
  const rows = [
    { page: 'script', state: 'find', viewport: 'desktop', theme: 'light' },
    { page: 'script', state: 'find', viewport: 'desktop', theme: 'dark' },
    { page: 'script', state: 'find', viewport: 'tablet', theme: 'light' },
  ];
  const md = markdownFor(rows, { repo: 'o/r', slice: 's1', sha: '<SHA>' });
  assert.match(md, /\| script \| find \| desktop \| !\[\]\(https:\/\/raw\.githubusercontent\.com\/o\/r\/<SHA>\/pr-screenshots\/s1\/script-find-desktop-light\.png\) \| !\[\]\(.*script-find-desktop-dark\.png\) \|/);
  assert.match(md, /\| script \| find \| tablet \| !\[\].*tablet-light\.png\) \| — \|/);
  assert.match(md, /<details><summary>script \(1 states, 3 images\)<\/summary>/);
});
