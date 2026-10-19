// What the public site's build and its server share: the content types of a static folder, and the check that a built page asks for
// nothing by an absolute path or from another host. The site opens from any sub-path and inside a sandboxed frame with no network, so
// one `src="/assets/x.js"` or one stylesheet from a CDN breaks it silently.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export const contentType = (file) => CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

const ABSOLUTE = /^(?:\/|[a-z][a-z0-9+.-]*:)/i;
// A data: or blob: URL carries its own bytes, and a fragment or a `#/route` stays on the page.
const SELF_CONTAINED = /^(?:data:|blob:|about:|javascript:|#)/i;
const isOutward = (url) => ABSOLUTE.test(url) && !SELF_CONTAINED.test(url);

/**
 * `html` with the body of every inline script (one with no `src`) cut out, so JavaScript that mentions a tag is not read as markup. It walks the
 * text instead of replacing a pattern, and puts a newline where it cut, so what is left cannot join into a new `<script`.
 */
function withoutInlineScripts(html) {
  const open = /<script\b(?![^>]*\bsrc=)[^>]*>/gi;
  const close = /<\/script\b[^>]*>/gi;
  let kept = '';
  let from = 0;
  for (let start = open.exec(html); start; start = open.exec(html)) {
    if (start.index < from) continue;
    close.lastIndex = start.index + start[0].length;
    const end = close.exec(html);
    kept += `${html.slice(from, start.index)}\n`;
    from = end ? end.index + end[0].length : html.length;
    open.lastIndex = from;
  }
  return kept + html.slice(from);
}

/** The resources an HTML page loads by an absolute path or from another host. A plain link (`<a href>`) is navigation, not a load. */
export function outwardHtmlLoads(html) {
  const found = [];
  const strippedScripts = withoutInlineScripts(html);
  for (const tag of strippedScripts.matchAll(/<(script|link|img|source|iframe|audio|video|embed)\b[^>]*>/gi)) {
    const [markup, name] = tag;
    if (name.toLowerCase() === 'link' && !/\brel=["']?(?:stylesheet|icon|preload|modulepreload|manifest|apple-touch-icon)/i.test(markup)) continue;
    for (const attribute of markup.matchAll(/\b(?:src|href|srcset|data-src)=["']([^"']*)["']/gi)) {
      if (isOutward(attribute[1].trim())) found.push(attribute[1]);
    }
  }
  return found;
}

/** `url(...)` and `@import` targets of a stylesheet that are absolute or from another host. */
export function outwardCssLoads(css) {
  const found = [];
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/gi)) if (isOutward(match[1].trim())) found.push(match[1]);
  for (const match of css.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) if (isOutward(match[1].trim())) found.push(match[1]);
  return found;
}

/** Every HTML and CSS file under `root` that loads something by an absolute path or from another host, as `{ file, url }` rows. */
export function findOutwardLoads(root) {
  const rows = [];
  for (const file of walk(root)) {
    const ext = extname(file).toLowerCase();
    if (ext !== '.html' && ext !== '.css') continue;
    const text = readFileSync(file, 'utf8');
    for (const url of ext === '.html' ? outwardHtmlLoads(text) : outwardCssLoads(text)) rows.push({ file: relative(root, file), url });
  }
  return rows;
}
