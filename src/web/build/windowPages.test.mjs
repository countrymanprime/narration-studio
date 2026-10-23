import assert from 'node:assert/strict';
import test from 'node:test';
import { outwardHtmlLoads } from './siteFiles.mjs';
import { DEMO_PAGES } from './guides.mjs';
import { APP_MIN_WINDOW, demoPage, storybookPage } from './windowPages.mjs';
import { NAME } from './shell.mjs';

const docs = [
  { page: 'index', title: 'Using the app', kind: 'How-to' },
  { page: 'proof', title: 'Proof', kind: 'How-to' },
];
const demo = demoPage({ withStorybook: true, docs });
const storybook = storybookPage({ docs });

test('both pages are in the site shell with their own entry marked, the search and the footer', () => {
  for (const [html, current] of [
    [demo, 'Live demo'],
    [storybook, 'Storybook'],
  ]) {
    for (const label of ['Product', 'Docs', 'Live demo', 'Storybook']) assert.match(html, new RegExp(`<a href="\\.\\./[^"]+"[^>]*>${label}</a>`));
    assert.match(html, new RegExp(`aria-current="page">${current}</a>`));
    assert.match(html, /aria-label="Search the site"/);
    assert.match(html, /aria-label="Switch colour theme"/);
    assert.match(html, /<footer class="foot">/);
  }
});

test('the demo window is a sandboxed frame of the app, with only scripts allowed, and its title bar holds the demo chrome', () => {
  assert.ok(demo.includes(`<iframe id="app" title="${NAME}, live demo" sandbox="allow-scripts"></iframe>`));
  assert.match(demo, /id="daw"[^>]*hidden/);
  assert.match(demo, /role="switch" aria-checked="false"[^>]*>.*Play animations/);
  assert.match(demo, /id="howto" href="\.\.\/docs\/production\.html"/);
  assert.match(demo, /Open in a new tab/);
  assert.match(demo, new RegExp(`at least ${APP_MIN_WINDOW.width} px wide`));
});

test('the demo page has no Storybook link without a Storybook, and names every demo page in its search', () => {
  const withoutStorybook = demoPage({ withStorybook: false, docs });
  assert.doesNotMatch(withoutStorybook, />Storybook<\/a>/);
  for (const { label } of DEMO_PAGES) assert.ok(demo.includes(`"${label} page"`), label);
});

test('neither page loads anything by an absolute path or from another host', () => {
  assert.deepEqual(outwardHtmlLoads(demo), []);
  assert.deepEqual(outwardHtmlLoads(storybook), []);
});
