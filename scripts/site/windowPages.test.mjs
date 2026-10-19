import assert from 'node:assert/strict';
import test from 'node:test';
import { outwardHtmlLoads } from './siteFiles.mjs';
import { APP_MIN_WINDOW, DEMO_PAGES, demoPage, storybookPage } from './windowPages.mjs';

const fonts = { 'barlow-condensed-700': 'data:font/woff2;base64,AA', 'ibm-plex-sans-400': 'data:font/woff2;base64,AA' };
const guides = [
  { page: 'index', title: 'Using the app' },
  { page: 'proof', title: 'Proof' },
];
const demo = demoPage({ fonts, icon: 'data:image/png;base64,AA', withStorybook: true, guides });
const storybook = storybookPage({ fonts, icon: 'data:image/png;base64,AA', guides });

test('both pages carry the site header with their own entry marked, the search and the footer', () => {
  for (const [html, current] of [
    [demo, 'Live demo'],
    [storybook, 'Storybook'],
  ]) {
    for (const label of ['Product', 'Docs', 'Live demo', 'Storybook']) assert.match(html, new RegExp(`<a href="[^"]+"[^>]*>${label}</a>`));
    assert.match(html, new RegExp(`aria-current="page">${current}</a>`));
    assert.match(html, /aria-label="Search the site"/);
    assert.match(html, /aria-label="Switch colour theme"/);
    assert.match(html, /<footer class="foot">/);
  }
});

test('the demo window is a sandboxed frame of the app, with only scripts allowed, and its title bar holds the demo chrome', () => {
  assert.match(demo, /<iframe id="app" title="Narration Studio, live demo" sandbox="allow-scripts"><\/iframe>/);
  assert.match(demo, /id="daw"[^>]*hidden/);
  assert.match(demo, /role="switch" aria-checked="false"[^>]*>.*Play animations/);
  assert.match(demo, /id="howto" href="\.\.\/guides\/production\.html"/);
  assert.match(demo, /Open in a new tab/);
  assert.match(demo, new RegExp(`at least ${APP_MIN_WINDOW.width} px wide`));
});

test('the Storybook page has no Storybook link without a Storybook, and the demo page names every demo page in its search', () => {
  const withoutStorybook = demoPage({ fonts, icon: 'x', withStorybook: false, guides });
  assert.doesNotMatch(withoutStorybook, />Storybook<\/a>/);
  for (const { title } of DEMO_PAGES) assert.ok(demo.includes(`${title.replace('&', '&amp;')} page<small>`), title);
});

test('neither page loads anything by an absolute path or from another host', () => {
  assert.deepEqual(outwardHtmlLoads(demo), []);
  assert.deepEqual(outwardHtmlLoads(storybook), []);
});
