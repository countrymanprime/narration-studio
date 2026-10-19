// Renders the how-to guides (docs/guides/using-the-app/*.md) into the public site: one static HTML page per guide in `guides/`, and the screenshots
// they use (docs/images/ui/) in `guides/images/`. Each page is one file with its styles and theme script inline, and every link is relative, so the
// guides open from any sub-path, from a file server and inside a sandboxed frame with no network, as the landing page and the demo do.
// Nothing in the app's runtime uses this: markdown-it is a dev dependency of the repo root.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, posix } from 'node:path';
import MarkdownIt from 'markdown-it';

const REPO_BLOB = 'https://github.com/countrymanprime/narration-utils/blob/main/';
const GUIDE_DIR = 'docs/guides/using-the-app';
const IMAGE_DIR = 'docs/images/ui';

// The sidebar's groups, as the guide's own index lists them (docs/guides/using-the-app/README.md), and the demo page each guide is about.
export const GROUPS = [
  { title: 'Start', pages: ['getting-started', 'navigation'] },
  { title: 'Production', pages: ['production', 'schedule'] },
  { title: 'Prep', pages: ['script', 'story-bible'] },
  { title: 'Record', pages: ['booth'] },
  { title: 'Edit', pages: ['editing'] },
  { title: 'Review', pages: ['proof', 'pickups'] },
  { title: 'Finish', pages: ['master-and-qc', 'delivery'] },
  { title: 'Settings', pages: ['settings'] },
];
export const DEMO_ROUTE = {
  'getting-started': '/',
  navigation: '/',
  production: '/',
  schedule: '/schedule',
  script: '/script',
  'story-bible': '/story-bible',
  booth: '/booth',
  editing: '/editing',
  proof: '/proof',
  pickups: '/pickups',
  'master-and-qc': '/master',
  delivery: '/delivery',
  settings: '/settings',
};

/** The id GitHub gives a heading, so the guides' `#anchor` links keep working: lower case, punctuation dropped, spaces to hyphens. */
export function slug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Renders one guide. `page` is its file name without `.md`. Returns the title, the HTML body and the images it names (file names in docs/images/ui).
 * A link to another guide becomes a link to its page, a link to anything else in the repo becomes a GitHub link, and an image path is rewritten to
 * `images/<file>`. A link that points nowhere throws, so a rename in the docs cannot ship a dead link.
 */
export function renderGuide(markdown, page, knownPages) {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  const images = [];
  let title = page;

  md.core.ruler.push('guide_links', (state) => {
    const used = new Map();
    for (const [index, token] of state.tokens.entries()) {
      if (token.type === 'heading_open') {
        const text = state.tokens[index + 1].children.map((child) => child.content).join('');
        if (token.tag === 'h1' && title === page) title = text;
        const base = slug(text);
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        token.attrSet('id', count === 0 ? base : `${base}-${count}`);
      }
      for (const child of token.children ?? []) {
        if (child.type === 'link_open') rewriteLink(child);
        if (child.type === 'image') rewriteImage(child);
      }
    }
  });

  function rewriteLink(token) {
    const href = token.attrGet('href') ?? '';
    if (/^https?:\/\//i.test(href)) {
      token.attrSet('rel', 'noopener');
      return;
    }
    if (href.startsWith('#')) return;
    const [path, hash = ''] = href.split('#');
    const target = posix.normalize(posix.join(GUIDE_DIR, path));
    const name = posix.basename(target, '.md');
    if (posix.dirname(target) === GUIDE_DIR && target.endsWith('.md') && knownPages.includes(name)) {
      token.attrSet('href', `${name === 'README' ? 'index' : name}.html${hash ? `#${hash}` : ''}`);
      return;
    }
    if (!existsSync(join(repoRoot, target))) throw new Error(`${page}.md: the link ${href} points at ${target}, which does not exist`);
    token.attrSet('href', `${REPO_BLOB}${target}${hash ? `#${hash}` : ''}`);
    token.attrSet('rel', 'noopener');
  }

  function rewriteImage(token) {
    const src = token.attrGet('src') ?? '';
    const target = posix.normalize(posix.join(GUIDE_DIR, src));
    if (posix.dirname(target) !== IMAGE_DIR) throw new Error(`${page}.md: the image ${src} is not in ${IMAGE_DIR}`);
    const file = posix.basename(target);
    if (!existsSync(join(repoRoot, target))) throw new Error(`${page}.md: the image ${src} does not exist`);
    if (!images.includes(file)) images.push(file);
    token.attrSet('src', `images/${file}`);
    token.attrSet('loading', 'lazy');
  }

  const defaultTable = md.renderer.rules.table_open;
  md.renderer.rules.table_open = (tokens, index, options, env, self) =>
    `<div class="table-scroll">${defaultTable ? defaultTable(tokens, index, options, env, self) : self.renderToken(tokens, index, options)}`;
  md.renderer.rules.table_close = () => '</table></div>';

  const body = md.render(markdown);
  return { title, body, images };
}

let repoRoot = process.cwd();

const STYLE = `
      :root { --bg:#efede7; --surface:#fbfaf7; --surface-2:#f4f2ec; --border:#dcd7cb; --text:#23201b; --text-muted:#5c564b; --accent:#b04f17; --accent-strong:#8f3f0f; --accent-soft:#f2deca; --btn-line:#2b2723; --focus:#1f5fbf; --code:#ece8de; }
      :root[data-theme='dark'] { --bg:#14120e; --surface:#1d1a15; --surface-2:#26221c; --border:#38332a; --text:#ede8de; --text-muted:#b0a797; --accent:#d9803f; --accent-strong:#f0a06a; --accent-soft:#3a2617; --btn-line:#7a7060; --focus:#7fb0ff; --code:#26221c; }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--text); font: 400 16px/1.6 'IBM Plex Sans', system-ui, sans-serif; }
      a { color: var(--accent-strong); }
      :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
      header { border-bottom: 1px solid var(--border); background: var(--surface); }
      .bar { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; min-height: 60px; padding: 0 16px; max-width: 1180px; margin: 0 auto; }
      .brand { font: 700 22px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; text-decoration: none; color: var(--text); margin-right: auto; }
      nav.top { display: flex; gap: 18px; flex-wrap: wrap; }
      nav.top a { font: 600 15px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; text-decoration: none; color: var(--text-muted); padding: 8px 0; }
      nav.top a:hover, nav.top a[aria-current] { color: var(--text); }
      button.theme { min-height: 36px; padding: 0 14px; border: 1px solid var(--btn-line); border-radius: 6px; background: transparent; color: var(--text); font: inherit; cursor: pointer; }
      .layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 32px; max-width: 1180px; margin: 0 auto; padding: 24px 16px 48px; }
      aside nav h2 { font: 600 13px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin: 18px 0 6px; }
      aside nav h2:first-child { margin-top: 0; }
      aside nav ul { list-style: none; margin: 0; padding: 0; }
      aside nav a { display: block; padding: 5px 10px; border-radius: 6px; text-decoration: none; color: var(--text); }
      aside nav a[aria-current] { background: var(--accent-soft); font-weight: 600; }
      aside nav a:hover { background: var(--surface-2); }
      article { min-width: 0; max-width: 820px; }
      article h1 { font: 700 40px/1.1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; text-transform: uppercase; margin: 8px 0 16px; }
      article h2 { font: 700 28px/1.2 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; margin: 36px 0 8px; padding-top: 8px; border-top: 1px solid var(--border); }
      article h3 { font-size: 18px; margin: 24px 0 6px; }
      article img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); display: block; margin: 12px 0; }
      article code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
      article pre { background: var(--code); padding: 12px; border-radius: 8px; overflow-x: auto; }
      article pre code { padding: 0; background: none; }
      article blockquote { margin: 12px 0; padding: 4px 16px; border-left: 3px solid var(--accent); background: var(--surface); }
      .table-scroll { overflow-x: auto; margin: 12px 0; }
      table { border-collapse: collapse; width: 100%; font-size: 15px; }
      th, td { text-align: left; vertical-align: top; padding: 8px 10px; border: 1px solid var(--border); }
      th { background: var(--surface-2); }
      .try { display: inline-flex; margin: 4px 0 8px; padding: 8px 16px; border: 1px solid var(--btn-line); border-radius: 6px; text-decoration: none; font-weight: 600; color: var(--text); background: var(--surface); }
      .try:hover { background: var(--accent-soft); }
      footer { border-top: 1px solid var(--border); padding: 20px 16px; text-align: center; color: var(--text-muted); font-size: 14px; }
      @media (max-width: 760px) { .layout { grid-template-columns: minmax(0, 1fr); } aside { order: 2; } article h1 { font-size: 32px; } }
`;

const THEME_HEAD = `<script>
      // Same key and logic as the landing page and apps/ui/index.html: the guides open in the theme the demo last used on this origin.
      (function () {
        try {
          var stored = localStorage.getItem('narration-ui-theme');
          var preference = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
          var dark = preference === 'dark' || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
          if (dark) document.documentElement.setAttribute('data-theme', 'dark');
        } catch (error) {
          // Storage or matchMedia unavailable (a sandboxed frame): the light palette.
        }
      })();
    </script>`;

const THEME_TAIL = `<script>
      document.getElementById('theme').addEventListener('click', function () {
        var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
        if (dark) document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        try {
          localStorage.setItem('narration-ui-theme', dark ? 'dark' : 'light');
        } catch (error) {
          // Storage unavailable: the choice lasts until the page closes.
        }
      });
    </script>`;

/** The whole page for one rendered guide: header, the guide list as a sidebar, the guide, and a link into the demo page it is about. */
export function guidePage({ page, title, body, titles, withStorybook, icon }) {
  const sidebar = [
    `<h2>Guides</h2><ul><li><a href="index.html"${page === 'index' ? ' aria-current="page"' : ''}>All guides</a></li></ul>`,
    ...GROUPS.map(
      (group) =>
        `<h2>${escapeHtml(group.title)}</h2><ul>${group.pages
          .map((name) => `<li><a href="${name}.html"${name === page ? ' aria-current="page"' : ''}>${escapeHtml(titles[name])}</a></li>`)
          .join('')}</ul>`,
    ),
  ].join('\n          ');
  const route = DEMO_ROUTE[page];
  const demo = route
    ? `<p><a class="try" href="../demo/index.html#${route}">Open this page in the live demo →</a></p>`
    : `<p><a class="try" href="../demo/index.html">Try the live demo →</a></p>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} · Narration Studio guides</title>
    <link rel="icon" href="${icon}" />
    ${THEME_HEAD}
    <style>${STYLE}</style>
  </head>
  <body>
    <header>
      <div class="bar">
        <a class="brand" href="../index.html">Narration Studio</a>
        <nav class="top" aria-label="Main">
          <a href="../demo/index.html">Live demo</a>
          <a href="index.html" aria-current="page">Guides</a>${withStorybook ? '\n          <a href="../storybook/index.html">Storybook</a>' : ''}
        </nav>
        <button type="button" class="theme" id="theme" aria-label="Switch colour theme">Theme</button>
      </div>
    </header>
    <div class="layout">
      <aside>
        <nav aria-label="Guides">
          ${sidebar}
        </nav>
      </aside>
      <main>
        <article>
          ${demo}
          ${body}
        </article>
      </main>
    </div>
    <footer>Narration Studio is AGPL-3.0-or-later. <a href="https://github.com/countrymanprime/narration-utils" rel="noopener">Source on GitHub</a></footer>
    ${THEME_TAIL}
  </body>
</html>
`;
}

/**
 * Writes `guides/` under `out`: `index.html` (the guide index) and one page per guide, and the screenshots they name in `guides/images/`.
 * Returns the page names and the images copied.
 */
export function buildGuides({ root, out, withStorybook, icon }) {
  repoRoot = root;
  const source = join(root, GUIDE_DIR);
  const files = readdirSync(source).filter((name) => name.endsWith('.md'));
  const known = files.map((name) => basename(name, '.md'));
  const rendered = {};
  for (const name of known) {
    const key = name === 'README' ? 'index' : name;
    rendered[key] = renderGuide(readFileSync(join(source, `${name}.md`), 'utf8'), name, known);
  }
  const listed = GROUPS.flatMap((group) => group.pages);
  for (const name of listed) if (!rendered[name]) throw new Error(`the site lists the guide ${name}, but ${GUIDE_DIR}/${name}.md does not exist`);
  for (const name of Object.keys(rendered))
    if (name !== 'index' && !listed.includes(name)) throw new Error(`${GUIDE_DIR}/${name}.md is in no group of scripts/site/guides.mjs`);
  const titles = Object.fromEntries(Object.entries(rendered).map(([name, guide]) => [name, guide.title]));
  const dir = join(out, 'guides');
  mkdirSync(join(dir, 'images'), { recursive: true });
  const images = new Set();
  for (const [name, guide] of Object.entries(rendered)) {
    writeFileSync(join(dir, `${name}.html`), guidePage({ page: name, ...guide, titles, withStorybook, icon }));
    for (const image of guide.images) images.add(image);
  }
  for (const image of images) copyFileSync(join(root, IMAGE_DIR, image), join(dir, 'images', image));
  return { pages: Object.keys(rendered).sort(), images: [...images].sort(), titles };
}
