import assert from 'node:assert/strict';
import test from 'node:test';
import { outwardCssLoads, outwardHtmlLoads, withIcon } from './siteFiles.mjs';

test('relative loads pass, absolute paths and other hosts are found', () => {
  const html = `<link rel="icon" href="./favicon.png"><script type="module" src="./assets/a.js"></script>
    <link rel="stylesheet" href="/assets/a.css"><script src="https://cdn.example/x.js"></script><img src="data:image/png;base64,AA">
    <a href="https://github.com/x/y">source</a><iframe src="storybook/index.html"></iframe>`;
  assert.deepEqual(outwardHtmlLoads(html), ['/assets/a.css', 'https://cdn.example/x.js']);
});

test('an inline script is not read for urls', () => {
  assert.deepEqual(outwardHtmlLoads('<script>var u = "<img src=/x.png>";</script>'), []);
});

test('css url() and @import are checked', () => {
  const css = `@font-face{src:url(./f.woff2)} a{background:url("/img.png")} @import "https://fonts.googleapis.com/css"; b{background:url(data:image/svg+xml;base64,AA)}`;
  assert.deepEqual(outwardCssLoads(css), ['/img.png', 'https://fonts.googleapis.com/css']);
});

test('a page with no icon gets an empty one, and a page with one is left alone', () => {
  assert.equal(withIcon('<html><head><title>x</title></head></html>'), '<html><head><link rel="icon" href="data:,"><title>x</title></head></html>');
  const own = '<head><link rel="icon" href="./f.svg"></head>';
  assert.equal(withIcon(own), own);
});
