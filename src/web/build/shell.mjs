// The public site's shell: the head (the app's fonts and icon inline, the theme applied before the first paint, the shared styles), the
// notice strip and top bar, and the footer with the search palette and the shared script. Every page of dist-site/ that is not the app or
// Storybook itself is built from it: the landing page (apps/site/landing/index.html, through fillShell), the docs (apps/site/build/guides.mjs,
// through sitePage), and the demo and Storybook pages that hold the app and the component library. Its look is the public-site mock's
// (docs/research/mockups/public-site/index.html); the styles and script are in apps/site/common/. See docs/operations/public-demo-site.md.
//
// `base` is the way from the page back to the site's root ('' for index.html, '../' for docs/x.html), so every address stays relative and
// the site opens from any sub-path and inside a sandboxed frame. Fonts and the icon are data URIs because a font fetched from a file beside
// the page needs CORS headers a sandboxed frame's host may not send.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ui = join(root, 'apps', 'ui');
const commonDir = join(root, 'apps', 'site', 'common');

// The repository the site links (Download, Full guide on GitHub, View source): the one the build runs in, so a renamed repository needs no edit here.
// Outside Actions, and for a value that is not `owner/name`, the current name is used.
const FALLBACK_SLUG = 'countrymanprime/narration-studio';
const envSlug = (process.env.GITHUB_REPOSITORY ?? '').trim();
export const REPO = `https://github.com/${/^[\w.-]+\/[\w.-]+$/.test(envSlug) ? envSlug : FALLBACK_SLUG}`;
const RELEASES = `${REPO}/releases`;
/** The site's sections, in the top bar's order: the page each opens, relative to the site's root. */
const SECTIONS = [
  { id: 'home', label: 'Product', href: 'index.html' },
  { id: 'docs', label: 'Docs', href: 'docs/index.html' },
  { id: 'demo', label: 'Live demo', href: 'demo/index.html' },
  { id: 'storybook', label: 'Storybook', href: 'storybook/index.html' },
];
/** The notice above the top bar, for a build that is not the published site (site-preview.yml's artifact). pages.yml sets SITE_PUBLISHED=1, which drops it. */
const NOTICE = process.env.SITE_PUBLISHED === '1' ? '' : 'Preview of the Narration Studio site, built from the repository. It is not published.';

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataUri = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;

// The weights the mock asked the font host for.
const FONTS = [
  ['Barlow Condensed', 'barlow-condensed', [500, 600, 700]],
  ['IBM Plex Mono', 'ibm-plex-mono', [400, 500]],
  ['IBM Plex Sans', 'ibm-plex-sans', [400, 500, 600, 700]],
];

let cached;
function assets() {
  cached ??= {
    fonts: FONTS.flatMap(([family, pkg, weights]) =>
      weights.map(
        (weight) =>
          `@font-face{font-family:'${family}';font-weight:${weight};font-display:swap;src:url('${dataUri(
            join(ui, 'node_modules', '@fontsource', pkg, 'files', `${pkg}-latin-${weight}-normal.woff2`),
            'font/woff2',
          )}') format('woff2')}`,
      ),
    ).join('\n'),
    icon: dataUri(join(ui, 'public', 'favicon.png'), 'image/png'),
    css: readFileSync(join(commonDir, 'shell.css'), 'utf8'),
    js: readFileSync(join(commonDir, 'shell.js'), 'utf8').replaceAll('__REPO__', REPO),
  };
  return cached;
}

/** The app's icon as a data URI. */
const iconUri = () => assets().icon;

const THEME_HEAD = `<script>(function(){try{var t=localStorage.getItem('narration-ui-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}})();</script>`;

/**
 * The search palette's entries for a page at `base`: every docs page, every demo page and Storybook. `docs` is `[{ page, title, kind }]`
 * (kind as the docs sidebar shows it) and `demoPages` is `[{ label, route }]`.
 */
export function searchItems({ base, docs, demoPages, withStorybook }) {
  return [
    ...docs.map((doc) => ({ t: doc.title, k: `Docs · ${doc.kind}`, href: `${base}docs/${doc.page}.html` })),
    ...demoPages.map((demo) => ({ t: `${demo.label} page`, k: 'Live demo', href: `${base}demo/index.html#${demo.route}` })),
    ...(withStorybook ? [{ t: 'Storybook', k: 'Components', href: `${base}storybook/index.html` }] : []),
  ];
}

/**
 * The three pieces of the shell for one page. `current` is the section the page belongs to (an id in SECTIONS), `withStorybook` false
 * leaves Storybook out of the top bar when the build has none, and `search` is the palette's entries (searchItems).
 */
function shellParts({ base, current, withStorybook = true, search = [] }) {
  const { fonts, icon, css, js } = assets();
  const sections = SECTIONS.filter((section) => withStorybook || section.id !== 'storybook');
  const nav = sections
    .map((s) => `<a href="${base}${s.href}" data-v="${s.id}"${s.id === current ? ' aria-current="page"' : ''}>${s.label}</a>`)
    .join('\n      ');
  const head = `<link rel="icon" type="image/png" href="${icon}">
${THEME_HEAD}
<style>
/* Fonts: the app's own files (@fontsource), inline; no font host is contacted. */
${fonts}
${css}</style>`;
  const header = `${NOTICE ? `<div id="top-strip" class="strip">${escapeHtml(NOTICE)} <button type="button" id="strip-x">Dismiss</button></div>\n\n` : ''}<header class="top">
  <div class="bar">
    <a class="brand" href="${base}index.html" aria-label="Narration Studio, home"><span class="mark" aria-hidden="true"><b></b><b></b><b></b><b></b></span>Narration Studio</a>
    <nav class="nav" id="nav" aria-label="Main">
      ${nav}
    </nav>
    <div class="bar-right">
      <button type="button" class="search-btn" id="open-pal" aria-label="Search the site"><svg class="i" viewBox="0 0 16 16"><path d="M11 11l4 4M7 12a5 5 0 110-10 5 5 0 010 10z"/></svg><span>Search</span><kbd>Ctrl K</kbd></button>
      <button type="button" class="icon-btn" id="theme" aria-label="Switch colour theme"></button>
      <a class="btn primary sm dl-btn" href="${RELEASES}" target="_blank" rel="noopener">Download</a>
      <button type="button" class="icon-btn menu-btn" id="menu" aria-label="Menu" aria-expanded="false"><svg class="i" viewBox="0 0 16 16"><path d="M2 4h12M2 8h12M2 12h12"/></svg></button>
    </div>
  </div>
</header>`;
  const footer = `<footer class="foot">
  <span class="display" style="font-size:20px;color:var(--text);text-transform:uppercase">Narration Studio</span>
  <a href="${REPO}" target="_blank" rel="noopener">GitHub</a>
  <a href="${RELEASES}" target="_blank" rel="noopener">Releases</a>
  <a href="${base}docs/index.html">Docs</a>
  <a href="${REPO}/blob/main/SECURITY.md" target="_blank" rel="noopener">Security</a>
  <span class="sp">Windows x64 · <a href="${REPO}/blob/main/LICENSE" target="_blank" rel="noopener">AGPL-3.0-or-later</a></span>
</footer>

<div class="pal-scrim" id="pal-scrim"><div class="pal" role="dialog" aria-modal="true" aria-label="Search">
  <input id="pal-in" type="text" placeholder="Search docs, demo pages, components…" autocomplete="off" aria-controls="pal-list">
  <ul id="pal-list" role="listbox"></ul>
  <div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
</div></div>
<div id="toasts" role="status" aria-live="polite"></div>
<script type="application/json" id="site-search">${JSON.stringify(search).replace(/</g, '\\u003c')}</script>
<script>
${js}</script>`;
  return { head, header, footer };
}

/** A page template with the shell put in at its `<!--shell:head-->`, `<!--shell:header-->` and `<!--shell:footer-->` markers. */
export function fillShell(template, options) {
  const parts = shellParts(options);
  let html = template.replaceAll('__REPO__', REPO);
  for (const name of ['head', 'header', 'footer']) {
    const marker = `<!--shell:${name}-->`;
    if (!html.includes(marker)) throw new Error(`the page template has no ${marker}`);
    html = html.replace(marker, () => parts[name]);
  }
  return html;
}

/**
 * A whole page in the shell. `meta` is extra head markup (description, social tags), `css` and `script` the page's own styles and script
 * (the script runs after the shell's and can read `window.Site`), and `body` what goes inside `<main>`.
 */
export function sitePage({ title, meta = '', css = '', body, script = '', ...options }) {
  const parts = shellParts(options);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
${meta}
${parts.head}
<style>
${css}</style>
</head>
<body>

${parts.header}

<main id="main">
${body}
</main>

${parts.footer}
${script ? `<script>\n${script}</script>\n` : ''}</body>
</html>
`;
}
