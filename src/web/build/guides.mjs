// Builds the public site's Docs section: one static page per condensed guide in src/web/docs/*.md, written to `docs/` in the site with
// the screenshots they use (docs/images/ui/) in `docs/images/`. The pages are the docs view of the public-site mock
// (docs/research/mockups/public-site/index.html): a grouped sidebar, the page with its lead, "On this page", previous and next, and a link to
// the full guide in docs/guides/using-the-app/, which stays the source of truth. Each page is one file in the site shell (src/web/build/shell.mjs)
// with every link relative, so the docs open from any sub-path and inside a sandboxed frame with no network.
// The build throws on a dead link or heading, a missing image and a page no group lists, so the docs cannot ship broken.
// Nothing in the app's runtime uses this: markdown-it is a dev dependency of the repo root.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, posix } from 'node:path';
import MarkdownIt from 'markdown-it';
import { REPO, searchItems, sitePage } from './shell.mjs';

const SOURCE_DIR = 'src/web/docs';
const GUIDE_DIR = 'docs/guides/using-the-app';
const IMAGE_DIR = 'docs/images/ui';
const REPO_BLOB = `${REPO}/blob/main/`;

// The sidebar's groups: the app's sidebar groups (src/studio/ui/src/components/layout/AppShell.tsx), with the overview and the first-run pages first.
export const GROUPS = [
  { title: 'Start', hint: 'Begin here', pages: ['index', 'getting-started', 'navigation'] },
  { title: 'Production', hint: 'Plan the book', pages: ['production', 'schedule'] },
  { title: 'Prep', hint: 'Before you record', pages: ['script', 'story-bible'] },
  { title: 'Record', hint: 'In the booth', pages: ['booth'] },
  { title: 'Edit', hint: 'Work on the audio', pages: ['editing'] },
  { title: 'Review', hint: 'Check the reading', pages: ['proof', 'pickups'] },
  { title: 'Finish', hint: 'Deliver the files', pages: ['master-and-qc', 'delivery'] },
  { title: 'Settings', hint: 'Set it up', pages: ['settings'] },
];
/** The demo page each docs page is about, as a hash route of demo/index.html. */
const DEMO_ROUTE = {
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
/** The demo pages the search palette lists, in the app's sidebar order. */
export const DEMO_PAGES = [
  { label: 'Production', route: '/' },
  { label: 'Schedule', route: '/schedule' },
  { label: 'Script', route: '/script' },
  { label: 'Story Bible', route: '/story-bible' },
  { label: 'Booth', route: '/booth' },
  { label: 'Editing', route: '/editing' },
  { label: 'Proof', route: '/proof' },
  { label: 'Pickups', route: '/pickups' },
  { label: 'Master & QC', route: '/master' },
  { label: 'Delivery', route: '/delivery' },
  { label: 'Settings', route: '/settings' },
];
// The kind every page is, as the mock's meta row names it.
const KIND = 'How-to';

/** The id GitHub gives a heading: lower case, punctuation dropped, spaces to hyphens. */
export function slug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ICON_INFO = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.5V11M8 5v.1"/></svg>';
const ICON_EXT = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3h4v4M13 3L7 9M11 10v3H3V5h3"/></svg>';

/** Splits a page into its front matter (`key: value` lines between `---` fences) and its markdown. Throws on a page without a title or lead. */
export function parsePage(text, page) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error(`${SOURCE_DIR}/${page}.md: no front matter`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  for (const key of ['title', 'lead']) if (!meta[key]) throw new Error(`${SOURCE_DIR}/${page}.md: the front matter has no ${key}`);
  return { meta, markdown: text.slice(match[0].length) };
}

/**
 * Renders one page's markdown. Returns the HTML, the `##` headings (`{ id, text }`), the images it names (file names in docs/images/ui) and
 * the links to other docs pages (`{ page, hash }`), which buildGuides checks once every page is rendered. A link to another page becomes
 * `<page>.html`, a link to anything else in the repository a GitHub link, and an image path `images/<file>`; a link or image that points at
 * nothing in the repository throws.
 */
export function renderPage(markdown, page, knownPages, repoRoot) {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  const headings = [];
  const images = [];
  const links = [];

  md.core.ruler.push('site_links', (state) => {
    const used = new Map();
    for (const [index, token] of state.tokens.entries()) {
      if (token.type === 'heading_open') {
        const text = state.tokens[index + 1].children.map((child) => child.content).join('');
        if (token.tag === 'h1') throw new Error(`${SOURCE_DIR}/${page}.md: the title comes from the front matter, not a # heading`);
        const base = slug(text);
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        token.attrSet('id', id);
        if (token.tag === 'h2') headings.push({ id, text });
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
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener');
      return;
    }
    if (href.startsWith('#')) {
      links.push({ page, hash: href.slice(1) });
      return;
    }
    const [path, hash = ''] = href.split('#');
    const target = posix.normalize(posix.join(SOURCE_DIR, path));
    const name = posix.basename(target, '.md');
    if (posix.dirname(target) === SOURCE_DIR && target.endsWith('.md')) {
      if (!knownPages.includes(name)) throw new Error(`${page}.md: the link ${href} names no docs page`);
      links.push({ page: name, hash });
      token.attrSet('href', `${name}.html${hash ? `#${hash}` : ''}`);
      return;
    }
    if (!existsSync(join(repoRoot, target))) throw new Error(`${page}.md: the link ${href} points at ${target}, which does not exist`);
    token.attrSet('href', `${REPO_BLOB}${target}${hash ? `#${hash}` : ''}`);
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener');
  }

  function rewriteImage(token) {
    const src = token.attrGet('src') ?? '';
    const target = posix.normalize(posix.join(SOURCE_DIR, src));
    if (posix.dirname(target) !== IMAGE_DIR) throw new Error(`${page}.md: the image ${src} is not in ${IMAGE_DIR}`);
    const file = posix.basename(target);
    if (!existsSync(join(repoRoot, target))) throw new Error(`${page}.md: the image ${src} does not exist`);
    if (!images.includes(file)) images.push(file);
    token.attrSet('src', `images/${file}`);
    token.attrSet('loading', 'lazy');
  }

  // The mock's blocks: a table in .tbl, a code block in .codebox with its copy button, a heading with its # anchor.
  md.renderer.rules.table_open = () => '<div class="tbl"><table>';
  md.renderer.rules.table_close = () => '</table></div>';
  md.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    const lang = token.info.trim();
    return `<div class="codebox">${lang ? `<span class="lang">${escapeHtml(lang.toUpperCase())}</span>` : ''}<button class="btn sm quiet" data-copy type="button">Copy</button><pre><code>${escapeHtml(token.content)}</code></pre></div>\n`;
  };
  md.renderer.rules.heading_close = (tokens, index, options, env, self) => {
    const open = tokens[index - 2];
    const anchor =
      open.tag === 'h2' ? `<a class="anchor" href="#${open.attrGet('id')}" data-sc="${open.attrGet('id')}" aria-label="Scroll to this heading">#</a>` : '';
    return `${anchor}${self.renderToken(tokens, index, options)}`;
  };

  const html = md
    .render(markdown)
    // A paragraph that is one screenshot is a figure, its title the caption.
    .replace(
      /<p><img src="([^"]+)" alt="([^"]*)"(?: title="([^"]*)")? loading="lazy"><\/p>/g,
      (_, src, alt, caption) =>
        `<figure class="fig"><img src="${src}" alt="${alt}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`,
    )
    // A quote that opens with "Note:" is the mock's note.
    .replace(
      /<blockquote>\s*<p><strong>Note:<\/strong>\s*([\s\S]*?)<\/p>\s*<\/blockquote>/g,
      (_, text) => `<div class="note">${ICON_INFO}<div>${text}</div></div>`,
    );
  if (/<img (?![^>]*loading="lazy")/.test(html)) throw new Error(`${page}.md: an image is not a paragraph of its own`);
  return { html, headings, images, links };
}

/** The whole page for one docs page, as the mock's docs view draws it. */
function docsPage({ page, meta, rendered, flat, withStorybook, search }) {
  const at = flat.findIndex((entry) => entry.page === page);
  const group = flat[at].group;
  const prev = flat[at - 1];
  const next = flat[at + 1];
  const side = GROUPS.map(
    (g) =>
      `<div><h4>${escapeHtml(g.title)} <em>${escapeHtml(g.hint)}</em></h4>${g.pages
        .map((name) => {
          const entry = flat.find((e) => e.page === name);
          return `<a href="${name}.html"${name === page ? ' aria-current="page"' : ''}>${escapeHtml(entry.title)}</a>`;
        })
        .join('')}</div>`,
  ).join('');
  const options = flat
    .map((e) => `<option value="${e.page}"${e.page === page ? ' selected' : ''}>${escapeHtml(e.group)}: ${escapeHtml(e.title)}</option>`)
    .join('');
  const paths =
    page === 'index'
      ? `<h2 id="pick-your-path">Pick your path<a class="anchor" href="#pick-your-path" data-sc="pick-your-path" aria-label="Scroll to this heading">#</a></h2><div class="dx">${GROUPS.filter(
          (g) => g.title !== 'Start',
        )
          .map(
            (g) =>
              `<a href="${g.pages[0]}.html"><small>${escapeHtml(g.hint)}</small><b>${escapeHtml(g.title)}</b><span>${g.pages.length} page${g.pages.length > 1 ? 's' : ''}</span></a>`,
          )
          .join('')}</div>`
      : '';
  const headings = [...rendered.headings, ...(page === 'index' ? [{ id: 'pick-your-path', text: 'Pick your path' }] : [])];
  const toc = headings.length ? `<b>On this page</b>${headings.map((h) => `<a href="#${h.id}" data-sc="${h.id}">${escapeHtml(h.text)}</a>`).join('')}` : '';
  const route = DEMO_ROUTE[page];
  const demo = route
    ? `<p>Open this page in the <a href="../demo/index.html#${route}">live demo</a>.</p>`
    : `<p>Try the app in the <a href="../demo/index.html">live demo</a>.</p>`;
  const guide = page === 'index' ? 'README' : page;
  const body = `<div class="view on" id="v-docs"><div class="wrap"><div class="docs">
  <nav class="side" id="doc-side" aria-label="Documentation">${side}</nav>
  <article class="doc" id="doc-article"><div class="doc-m"><label class="sr" for="doc-sel">Page</label><select id="doc-sel">${options}</select></div>
   <div class="crumb">Docs / ${escapeHtml(group)} / ${escapeHtml(meta.title)}</div><h1>${escapeHtml(meta.title)}</h1><p class="lead">${escapeHtml(meta.lead)}</p>
${rendered.html}${paths}
${demo}
   <div class="meta-row"><span class="badge info">${KIND}</span><a href="${REPO_BLOB}${GUIDE_DIR}/${guide}.md" target="_blank" rel="noopener">Full guide on GitHub ${ICON_EXT}</a><span style="margin-left:auto" id="fb">Was this page helpful? <button class="btn sm" type="button" data-fb="y">Yes</button> <button class="btn sm" type="button" data-fb="n">No</button></span></div>
   <div class="pn">${prev ? `<a href="${prev.page}.html"><small>Previous</small><b>${escapeHtml(prev.title)}</b></a>` : '<span></span>'}${next ? `<a href="${next.page}.html"><small>Next</small><b>${escapeHtml(next.title)}</b></a>` : '<span></span>'}</div></article>
  <aside class="toc" id="doc-toc" aria-label="On this page">${toc}</aside>
</div></div></div>`;
  return { body, prevNext: { prev, next } };
}

/**
 * Writes `docs/` under `out`: one page per source in src/web/docs/ (`index.html` is the overview) and the screenshots they name in
 * `docs/images/`. Returns the pages (`{ page, title, kind }`, in sidebar order) and the images copied. Throws on a source no group lists, a
 * listed page with no source, a full guide that does not exist, and a link to a page or heading that does not exist.
 */
export function buildGuides({ root, out, withStorybook }) {
  const sourceDir = join(root, SOURCE_DIR);
  const sources = readdirSync(sourceDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => basename(name, '.md'));
  const listed = GROUPS.flatMap((group) => group.pages);
  for (const name of listed) if (!sources.includes(name)) throw new Error(`the site lists the docs page ${name}, but ${SOURCE_DIR}/${name}.md does not exist`);
  for (const name of sources) if (!listed.includes(name)) throw new Error(`${SOURCE_DIR}/${name}.md is in no group of src/web/build/guides.mjs`);

  const pages = {};
  for (const name of listed) {
    const guide = join(root, GUIDE_DIR, `${name === 'index' ? 'README' : name}.md`);
    if (!existsSync(guide)) throw new Error(`${SOURCE_DIR}/${name}.md has no full guide at ${GUIDE_DIR}`);
    const { meta, markdown } = parsePage(readFileSync(join(sourceDir, `${name}.md`), 'utf8'), name);
    pages[name] = { meta, rendered: renderPage(markdown, name, listed, root) };
  }
  for (const [name, { rendered }] of Object.entries(pages)) {
    for (const link of rendered.links) {
      if (!link.hash) continue;
      const ids = pages[link.page].rendered.headings.map((h) => h.id);
      const all = [...ids, ...[...pages[link.page].rendered.html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])];
      if (!all.includes(link.hash)) throw new Error(`${name}.md: the link to ${link.page}#${link.hash} names no heading on that page`);
    }
  }

  const flat = GROUPS.flatMap((group) => group.pages.map((page) => ({ page, title: pages[page].meta.title, group: group.title, kind: KIND })));
  const search = searchItems({ base: '../', docs: flat, demoPages: DEMO_PAGES, withStorybook });
  const css = readFileSync(join(sourceDir, 'docs.css'), 'utf8');
  const script = readFileSync(join(sourceDir, 'docs.js'), 'utf8');
  const dir = join(out, 'docs');
  mkdirSync(join(dir, 'images'), { recursive: true });
  const images = new Set();
  for (const { page } of flat) {
    const { meta, rendered } = pages[page];
    const { body } = docsPage({ page, meta, rendered, flat, withStorybook, search });
    const html = sitePage({
      title: `${meta.title} · Narration Studio docs`,
      meta: `<meta name="description" content="${escapeHtml(meta.lead)}">`,
      base: '../',
      current: 'docs',
      withStorybook,
      search,
      css,
      body,
      script,
    });
    writeFileSync(join(dir, `${page}.html`), html);
    for (const image of rendered.images) images.add(image);
  }
  for (const image of images) copyFileSync(join(root, IMAGE_DIR, image), join(dir, 'images', image));
  return { pages: flat.map(({ page, title, kind }) => ({ page, title, kind })), images: [...images].sort() };
}
