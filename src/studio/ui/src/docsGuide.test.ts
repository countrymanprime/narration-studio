import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import docScreenshots from '../tests/visual/doc-screenshots.json';

// docs/guides/using-the-app/ is a multi-page guide: README.md is the index and
// every other .md file is one page (or one large feature) of the app. Nothing
// else keeps the index, the Previous/Next footers, the cross-links and the
// screenshot embeds consistent when a page is added, renamed or removed, so
// this test does.

const repoRoot = join(__dirname, '..', '..', '..', '..');
const guideDir = join(repoRoot, 'docs', 'guides', 'using-the-app');
const INDEX = 'README.md';
const INDEX_TITLE = 'Using the app';

const LINK_PATTERN = /!?\[[^\]]*\]\(([^)\s]+)\)/g;
const EMBED_PATTERN = /!\[[^\]]*\]\(([^)\s]+\.webp)\)/g;

const guideFiles = existsSync(guideDir) ? readdirSync(guideDir).filter((file) => file.endsWith('.md')) : [];
const pageFiles = guideFiles.filter((file) => file !== INDEX);

const read = (file: string): string => readFileSync(join(guideDir, file), 'utf8');

function linkTargets(markdown: string, pattern: RegExp = LINK_PATTERN): string[] {
  return [...markdown.matchAll(pattern)].map((match) => match[1]);
}

function isLocal(target: string): boolean {
  return !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(target);
}

// GitHub's heading anchor: lower-case, drop punctuation, spaces become hyphens.
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

function headingSlugs(markdown: string): Set<string> {
  const headings = [...markdown.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map((match) => slug(match[1]));
  return new Set(headings);
}

function lastLine(markdown: string): string {
  return markdown.trimEnd().split('\n').at(-1) ?? '';
}

function firstLine(markdown: string): string {
  return markdown.trimStart().split('\n')[0] ?? '';
}

// Pages in the order the index lists them: each page's first link in README.md.
function indexOrder(): string[] {
  const seen: string[] = [];
  for (const target of linkTargets(read(INDEX))) {
    const file = target.split('#')[0];
    if (isLocal(target) && pageFiles.includes(file) && !seen.includes(file)) seen.push(file);
  }
  return seen;
}

// One entry of tests/visual/doc-screenshots.json, as far as the embed rule reads it.
type ScreenshotEntry = { docName: string; alsoOn?: string[] };
type Embed = { file: string; name: string };

// Each image is embedded once on one page of its own and once on each guide page its entry names in `alsoOn` (a
// tutorial showing a reference page's picture of a step), and nowhere else; every embed is a manifest entry.
function screenshotEmbedProblems(entries: readonly ScreenshotEntry[], embeds: readonly Embed[], pages: readonly string[]): string[] {
  const problems: string[] = [];
  for (const { docName, alsoOn = [] } of entries) {
    const embedding = embeds.filter((embed) => embed.name === docName).map((embed) => embed.file);
    for (const page of alsoOn) {
      if (!pages.includes(page)) problems.push(`${docName} names ${page} in alsoOn, which is not a guide page`);
      else if (!embedding.includes(page)) problems.push(`${docName} names ${page} in alsoOn, but ${page} does not embed it`);
    }
    const own = [...embedding];
    for (const page of alsoOn) {
      const at = own.indexOf(page);
      if (at !== -1) own.splice(at, 1);
    }
    if (own.length === 1) continue;
    if (own.length === 0 && embedding.length > 0) problems.push(`${docName} is embedded only on its alsoOn pages; embed it on one page of its own`);
    else problems.push(`${docName} is embedded ${embedding.length} times (${embedding.join(', ')}); embed it on one page, or name the others in its alsoOn`);
  }
  const curated = new Set(entries.map((entry) => entry.docName));
  for (const embed of embeds) {
    if (!curated.has(embed.name)) problems.push(`${embed.file} embeds ${embed.name}.webp, which is not in doc-screenshots.json`);
  }
  return problems;
}

// A page leads somewhere: a `## What next` section with at least two links, so a reader who finished the page has a
// choice of where to go besides the Previous / Next footer. The section runs to the next `## ` heading or the footer rule.
function whatNextProblem(file: string, markdown: string): string | undefined {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => /^## What next\s*$/.test(line));
  if (start === -1) return `${file} has no "## What next" section`;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line) || /^---\s*$/.test(line));
  const links = linkTargets(rest.slice(0, end === -1 ? undefined : end).join('\n'), LINK_PATTERN).length;
  return links >= 2 ? undefined : `${file}: "## What next" has ${links} link${links === 1 ? '' : 's'}; give the reader at least two places to go`;
}

describe('docs/guides/using-the-app', () => {
  test('has an index and at least one page', () => {
    expect(guideFiles, `${guideDir} needs a ${INDEX}`).toContain(INDEX);
    expect(pageFiles.length).toBeGreaterThan(0);
  });

  test('the index links every page, and only pages that exist', () => {
    expect([...indexOrder()].sort()).toEqual([...pageFiles].sort());
  });

  test('every page opens with a breadcrumb back to the index', () => {
    const missing = pageFiles.filter((file) => !firstLine(read(file)).startsWith(`[${INDEX_TITLE}](${INDEX})`));
    expect(missing, `first line of each page must start with [${INDEX_TITLE}](${INDEX}) › <page>`).toEqual([]);
  });

  test('every page ends with Previous / Index / Next links that follow the index order', () => {
    const order = indexOrder();
    const wrong = order.flatMap((file, position) => {
      const expected = [order[position - 1], INDEX, order[position + 1]].filter((href): href is string => Boolean(href));
      const actual = linkTargets(lastLine(read(file)));
      return JSON.stringify(actual) === JSON.stringify(expected)
        ? []
        : [`${file}: footer links ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`];
    });
    expect(wrong).toEqual([]);
  });

  test('every page ends its content with a What next section of at least two links', () => {
    const problems = pageFiles.map((file) => whatNextProblem(file, read(file))).filter((problem) => problem !== undefined);
    expect(problems).toEqual([]);
  });

  describe('the What next rule', () => {
    test('two links under the heading pass', () => {
      expect(whatNextProblem('a.md', '# A\n\n## What next\n\n- [B](b.md)\n- [C](c.md)\n\n---\n\n[Index](README.md)')).toBeUndefined();
    });

    test('a page without the section fails', () => {
      expect(whatNextProblem('a.md', '# A\n\n## Related\n\n- [B](b.md)\n- [C](c.md)')).toBe('a.md has no "## What next" section');
    });

    test('links after the section, in the next section or the footer, do not count', () => {
      expect(whatNextProblem('a.md', '# A\n\n## What next\n\n- [B](b.md)\n\n## The picker\n\n[C](c.md)\n\n---\n\n[Index](README.md)')).toBe(
        'a.md: "## What next" has 1 link; give the reader at least two places to go',
      );
    });

    test('a What next heading at a lower level does not count', () => {
      expect(whatNextProblem('a.md', '# A\n\n### What next\n\n- [B](b.md)\n- [C](c.md)')).toBe('a.md has no "## What next" section');
    });
  });

  test('every relative link and image resolves to a real file and heading', () => {
    const broken: string[] = [];
    for (const file of guideFiles) {
      const markdown = read(file);
      for (const target of linkTargets(markdown).filter(isLocal)) {
        const [path, fragment] = target.split('#');
        const resolved = path === '' ? join(guideDir, file) : resolve(guideDir, dirname(file), path);
        if (!existsSync(resolved)) {
          broken.push(`${file}: ${target} does not exist`);
        } else if (fragment && resolved.endsWith('.md')) {
          const source = resolved === join(guideDir, file) ? markdown : readFileSync(resolved, 'utf8');
          if (!headingSlugs(source).has(fragment)) broken.push(`${file}: ${target} has no matching heading`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  // The public docs site (MkDocs, tools/docs-site) builds heading ids with Python-Markdown's slugify, which collapses a run of
  // spaces and hyphens into one hyphen; GitHub keeps one hyphen per space. "Recording & DAW" is recording--daw on GitHub and
  // recording-daw on the site, so a link to it breaks in one of the two. A fragment must be the same id under both rules.
  test('every link fragment is the same heading id on GitHub and on the docs site', () => {
    const siteSlug = (heading: string): string =>
      heading
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .trim()
        .replace(/[-\s]+/g, '-');
    const differs: string[] = [];
    for (const file of guideFiles) {
      for (const target of linkTargets(read(file)).filter(isLocal)) {
        const [path, fragment] = target.split('#');
        if (!fragment) continue;
        const resolved = path === '' ? join(guideDir, file) : resolve(guideDir, dirname(file), path);
        if (!resolved.endsWith('.md') || !existsSync(resolved)) continue;
        const headings = [...readFileSync(resolved, 'utf8').matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map((match) => match[1]);
        const heading = headings.find((candidate) => slug(candidate) === fragment);
        if (heading !== undefined && siteSlug(heading) !== fragment) {
          differs.push(`${file}: ${target} is #${siteSlug(heading)} on the docs site; link the page, or a heading without punctuation`);
        }
      }
    }
    expect(differs).toEqual([]);
  });

  test('every curated doc screenshot is embedded on its page and the pages it names, and every embed is curated', () => {
    const embeds = pageFiles.flatMap((file) => linkTargets(read(file), EMBED_PATTERN).map((target) => ({ file, name: basename(target, '.webp') })));
    expect(screenshotEmbedProblems(docScreenshots, embeds, pageFiles)).toEqual([]);
  });

  describe('the screenshot embed rule', () => {
    const entry = (docName: string, alsoOn?: string[]): ScreenshotEntry => ({ docName, ...(alsoOn ? { alsoOn } : {}) });
    const pages = ['booth.md', 'getting-started.md', 'proof.md'];

    test('one embed on one page passes', () => {
      expect(screenshotEmbedProblems([entry('booth-setup')], [{ file: 'booth.md', name: 'booth-setup' }], pages)).toEqual([]);
    });

    test('a second embed fails unless the entry names that page in alsoOn', () => {
      const embeds = [
        { file: 'booth.md', name: 'booth-setup' },
        { file: 'getting-started.md', name: 'booth-setup' },
      ];
      expect(screenshotEmbedProblems([entry('booth-setup')], embeds, pages)).toEqual([
        'booth-setup is embedded 2 times (booth.md, getting-started.md); embed it on one page, or name the others in its alsoOn',
      ]);
      expect(screenshotEmbedProblems([entry('booth-setup', ['getting-started.md'])], embeds, pages)).toEqual([]);
    });

    test('a page named in alsoOn that does not embed the image, or does not exist, fails', () => {
      expect(screenshotEmbedProblems([entry('booth-setup', ['proof.md', 'gone.md'])], [{ file: 'booth.md', name: 'booth-setup' }], pages)).toEqual([
        'booth-setup names proof.md in alsoOn, but proof.md does not embed it',
        'booth-setup names gone.md in alsoOn, which is not a guide page',
      ]);
    });

    test('an image embedded only on its alsoOn pages has no page of its own, and fails', () => {
      expect(screenshotEmbedProblems([entry('booth-setup', ['getting-started.md'])], [{ file: 'getting-started.md', name: 'booth-setup' }], pages)).toEqual([
        'booth-setup is embedded only on its alsoOn pages; embed it on one page of its own',
      ]);
    });

    test('an embed twice on the same page fails', () => {
      const embeds = [
        { file: 'booth.md', name: 'booth-setup' },
        { file: 'booth.md', name: 'booth-setup' },
      ];
      expect(screenshotEmbedProblems([entry('booth-setup')], embeds, pages)).toEqual([
        'booth-setup is embedded 2 times (booth.md, booth.md); embed it on one page, or name the others in its alsoOn',
      ]);
    });

    test('an embed the manifest does not list fails', () => {
      expect(screenshotEmbedProblems([], [{ file: 'booth.md', name: 'booth-old' }], pages)).toEqual([
        'booth.md embeds booth-old.webp, which is not in doc-screenshots.json',
      ]);
    });
  });
});
