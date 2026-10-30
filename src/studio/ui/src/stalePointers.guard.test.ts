// @vitest-environment node
// Audit cluster 22 (docs/research/ui-function-audit.md): copy and links must not point at a page that moved. The Tracks page is the audio engine
// panel (`EnginePanelLink`), and the narrator's name is under Settings > Project. This reads the strings a narrator can see (string literals,
// template text and JSX text, never a comment) and fails on a pointer the app no longer has.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname);
const SOURCE = /\.(ts|tsx)$/;
const SKIP = /\.(test|stories|contract)\.|\/api\/|\/fixtures\//;

/** Words that point at a place the app no longer has, with where to point instead. */
const STALE: Array<{ pattern: RegExp; instead: string }> = [
  { pattern: /\bTracks page\b/, instead: 'the audio engine panel (EnginePanelLink)' },
  { pattern: /\bOpen Tracks\b/, instead: 'Open the audio engine panel' },
  { pattern: /Settings > General\b/, instead: 'Settings > Project' },
];

/** Routes that no longer render a page: a link to one bounces through a redirect, so the narrator leaves the page they were on. */
const RETIRED_ROUTES = ['/tracks'];
/** The one file that keeps a retired route alive for old bookmarks. */
const ROUTE_TABLE = 'App.tsx';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return SOURCE.test(name) && !SKIP.test(path.split(sep).join('/')) ? [path] : [];
  });
}

function visibleText(path: string): string[] {
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

describe('no copy or link points at a page that moved', () => {
  const found: string[] = [];
  for (const path of sources(SRC)) {
    const name = relative(SRC, path).split(sep).join('/');
    for (const text of visibleText(path)) {
      for (const { pattern, instead } of STALE) if (pattern.test(text)) found.push(`${name}: "${text.slice(0, 60)}" - say ${instead}`);
      if (name !== ROUTE_TABLE && RETIRED_ROUTES.includes(text)) found.push(`${name}: links to the retired route ${text}`);
    }
  }
  it('finds none in the strings the app draws', () => {
    expect(found).toEqual([]);
  });
});
