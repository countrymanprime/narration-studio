// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

// docs/design/component-selection.md says which primitive a control is built from, and reviewers cite its rule IDs. This
// holds the page to the code, so a renamed primitive, a moved file or a reused ID fails here and not in a review:
// - every rule ID (`**CS-B1**`) is defined once;
// - a backticked component name (`Switch`, `Pill look="filter"`) is a file in `components/primitives/` or an export of one, or a
//   row of the page's "Shared controls outside the primitives" table whose file exports it, or is marked `(**Proposed**)`,
//   and a Proposed name is not written yet (the PR that extracts it removes the mark);
// - every backticked `.ts`, `.tsx` or `.go` path exists, from `src/studio/ui/src/` or from the repository root;
// - every relative link resolves, with its anchor;
// - `docs/design/design-system.md` links to the page.
const srcDir = __dirname;
const repoRoot = join(srcDir, '..', '..', '..', '..');
const primitivesDir = join(srcDir, 'components', 'primitives');
const pagePath = join(repoRoot, 'docs', 'design', 'component-selection.md');
const page = readFileSync(pagePath, 'utf8');

const EXPORT = /export\s+(?:default\s+)?(?:function|const|class|type|interface)\s+([A-Z][A-Za-z0-9]*)/g;

function exportsOf(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(EXPORT)].map((match) => match[1]);
}

// A primitive is named by its file (`Toast`) or by one of the file's exports (`TooltipTarget`, `SplitMain`).
const primitiveNames = new Set(
  readdirSync(primitivesDir)
    .filter((file) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file))
    .flatMap((file) => [file.replace(/\.tsx?$/, ''), ...exportsOf(join(primitivesDir, file))]),
);

/** The text of every inline code span. */
const spans = [...page.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
/** A span that names a component: its first word is PascalCase (`Switch`, `Button variant="link"`), not a constant, a path or a key. */
const componentNames = new Set(spans.map((span) => /^([A-Z][a-z][A-Za-z0-9]*)(?=$| )/.exec(span)?.[1]).filter((name): name is string => name !== undefined));
const proposed = new Set([...page.matchAll(/`([A-Z][A-Za-z0-9]*)` \(\*\*Proposed\*\*\)/g)].map((match) => match[1]));

/** The rows of "Shared controls outside the primitives": a component name and the file that exports it. */
function sharedControls(): Map<string, string> {
  const section = page.split(/^### /m).find((part) => part.startsWith('Shared controls outside the primitives'));
  if (!section) throw new Error('component-selection.md has no "Shared controls outside the primitives" table');
  const rows = [...section.split(/^## /m)[0].matchAll(/^\| `([A-Za-z0-9]+)` \| `([^`]+)` \|/gm)];
  return new Map(rows.map((row) => [row[1], row[2]]));
}

function fromSrcOrRoot(path: string): boolean {
  return existsSync(join(srcDir, path)) || existsSync(join(repoRoot, path));
}

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens. */
function anchors(markdown: string): Set<string> {
  const headings = [...markdown.matchAll(/^#{1,6} (.+)$/gm)].map((match) => match[1]);
  return new Set(
    headings.map((heading) =>
      heading
        .toLowerCase()
        .replace(/[^\w\- ]/g, '')
        .replace(/ /g, '-'),
    ),
  );
}

describe('docs/design/component-selection.md', () => {
  test('every-rule-id-is-defined-once', () => {
    const ids = [...page.matchAll(/\*\*(CS-[A-Z]\d+)\*\*/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(50);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  test('every-rule-id-cited-is-defined', () => {
    const defined = new Set([...page.matchAll(/\*\*(CS-[A-Z]\d+)\*\*/g)].map((match) => match[1]));
    const cited = new Set([...page.matchAll(/\bCS-[A-Z]\d+\b/g)].map((match) => match[0]));
    expect([...cited].filter((id) => !defined.has(id))).toEqual([]);
  });

  test('every-component-named-is-a-primitive-a-shared-control-or-proposed', () => {
    const shared = sharedControls();
    const unknown = [...componentNames].filter((name) => !primitiveNames.has(name) && !shared.has(name) && !proposed.has(name));
    expect(unknown, 'name the file instead, add a "Shared controls" row, or mark it (**Proposed**)').toEqual([]);
  });

  test('a-shared-control-is-exported-by-its-file', () => {
    const wrong = [...sharedControls()].filter(([name, file]) => !existsSync(join(srcDir, file)) || !exportsOf(join(srcDir, file)).includes(name));
    expect(wrong).toEqual([]);
  });

  test('a-proposed-primitive-is-not-written-yet', () => {
    expect(proposed.size).toBeGreaterThan(0);
    expect(
      [...proposed].filter((name) => primitiveNames.has(name)),
      'it exists now: remove the (**Proposed**) mark',
    ).toEqual([]);
  });

  test('every-source-path-exists', () => {
    const paths = spans.filter((span) => /^[\w./-]+\.(tsx?|go)$/.test(span));
    expect(paths.length).toBeGreaterThan(20);
    expect([...new Set(paths)].filter((path) => !fromSrcOrRoot(path))).toEqual([]);
  });

  test('every-relative-link-resolves', () => {
    const targets = [...page.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]).filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target));
    expect(targets.length).toBeGreaterThan(5);
    const broken = targets.filter((target) => {
      const [file, anchor] = target.split('#');
      const path = file ? resolve(dirname(pagePath), file) : pagePath;
      if (!existsSync(path)) return true;
      return Boolean(anchor) && !anchors(readFileSync(path, 'utf8')).has(anchor);
    });
    expect(broken).toEqual([]);
  });

  test('the-design-system-links-to-the-page', () => {
    expect(readFileSync(join(repoRoot, 'docs', 'design', 'design-system.md'), 'utf8')).toContain('](component-selection.md');
  });

  test('the-readers-find-what-is-there', () => {
    expect(primitiveNames.has('TooltipTarget')).toBe(true);
    expect(componentNames.has('Switch')).toBe(true);
    expect(proposed.has('ColourField')).toBe(true);
    expect(anchors('## Where the code departs from this page (2026-11-20)').has('where-the-code-departs-from-this-page-2026-11-20')).toBe(true);
  });
});
