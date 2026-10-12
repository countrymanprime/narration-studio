// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

// ADR 0780 decision 5: context menus come from providers (`registerContextProvider`), and one `ContextMenuHost` in `<main>` shows
// them. No page writes its own `<ContextMenu items={...}>`, and nothing listens for `contextmenu` privately (the PRD's "What We're
// NOT Building" bans a global listener on `document`). This scan counts `<ContextMenu>` JSX elements per file outside the
// primitive and the host, and `onContextMenu` attributes and `addEventListener('contextmenu', ...)` calls outside the same two
// files. A ceiling may only fall: a lower real count fails until the entry is lowered or deleted, and a file with no entry may
// have none. `keydown` listeners are `listenerGuard.test.ts`'s and surfaces fed by the catalogue are `surfaces.test.ts`'s.

// `<ContextMenu>` elements per file. Each entry names the swap slice that deletes the site.
const MENU_CEILING: Record<string, number> = {
  // The old Proof chapter workspace (effects on a passage, ADR 0705). The Editing swap (SNE-9) deletes it and builds its
  // right-click menu as a context provider (SNE-3).
  // The Add FX button and the FX key open the DAW's effect list at the selection through this menu (SN-E64). It is fed the list for
  // the current selection each time it opens; moving it onto a context provider belongs to the Editing swap (SNE-9).
  'src/components/editing/range/fx/useFxWords.tsx': 1,
};

// Private `contextmenu` handlers per file. None today.
const HANDLER_CEILING: Record<string, number> = {};

const uiRoot = join(__dirname, '..');
const srcRoot = join(uiRoot, 'src');
const EXEMPT_MENU = ['src/components/primitives/', 'src/components/layout/ContextMenuHost.tsx'];
const EXEMPT_HANDLER = ['src/components/primitives/ContextMenu.tsx', 'src/components/layout/ContextMenuHost.tsx'];
const SOURCE = /\.tsx?$/;
const NOT_UNDER_TEST = /\.(test|stories)\.tsx?$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry.name) && !NOT_UNDER_TEST.test(entry.name) ? [path] : [];
  });
}

type Found = { menus: number; handlers: number };

// Read with the TypeScript parser, so a comment or a string that only mentions `<ContextMenu` is not counted and a component
// called `ContextMenuHost` is not `ContextMenu`.
function scan(source: string, fileName = 'probe.tsx'): Found {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Found = { menus: 0, handlers: 0 };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(file) === 'ContextMenu') found.menus++;
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && attr.name.getText(file) === 'onContextMenu') found.handlers++;
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'addEventListener') {
      const first = node.arguments[0];
      if (first && ts.isStringLiteralLike(first) && first.text === 'contextmenu') found.handlers++;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

const files = sourceFiles(srcRoot).map((file) => relative(uiRoot, file).split(sep).join('/'));
const scans = files.map((file) => [file, scan(readFileSync(join(uiRoot, file), 'utf8'), file)] as const);

function countsOf(pick: (found: Found) => number, exempt: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [file, found] of scans) {
    if (exempt.some((prefix) => file.startsWith(prefix))) continue;
    const count = pick(found);
    if (count > 0) counts[file] = count;
  }
  return counts;
}

// Files whose count differs from the ceiling in the given direction, named in the failure message.
function over(counts: Record<string, number>, ceiling: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([file, count]) => count > (ceiling[file] ?? 0))
    .map(([file, count]) => `${file}: ${count} > ${ceiling[file] ?? 0}`);
}
function under(counts: Record<string, number>, ceiling: Record<string, number>): string[] {
  return Object.entries(ceiling)
    .filter(([file, allowed]) => (counts[file] ?? 0) < allowed)
    .map(([file]) => file);
}

describe('context menus come from providers (ADR 0780)', () => {
  const menus = countsOf((found) => found.menus, EXEMPT_MENU);
  const handlers = countsOf((found) => found.handlers, EXEMPT_HANDLER);

  test('inline-menu-sites-only-fall', () => {
    expect(over(menus, MENU_CEILING), 'register a provider with `registerContextProvider` instead of writing <ContextMenu items={...}>').toEqual([]);
    expect(under(menus, MENU_CEILING), 'a page lost its <ContextMenu>: lower its ceiling (delete the entry at zero)').toEqual([]);
  });

  test('new-file-with-a-menu-fails', () => {
    const fixture = { ...menus, 'src/components/newpage/Page.tsx': scan('const a = <ContextMenu items={[]}>x</ContextMenu>;').menus };
    const failures = over(fixture, MENU_CEILING);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('src/components/newpage/Page.tsx');
  });

  test('no-private-contextmenu-handlers', () => {
    expect(over(handlers, HANDLER_CEILING), 'show a menu through `registerContextProvider`; the host owns the contextmenu event').toEqual([]);
    expect(under(handlers, HANDLER_CEILING)).toEqual([]);
  });

  test('scan-reads-the-parser-not-the-text', () => {
    expect(scan('const a = <ContextMenu items={[]}>x</ContextMenu>;').menus).toBe(1);
    expect(scan('const a = <ContextMenu items={[]} />;').menus).toBe(1);
    expect(scan('// <ContextMenu items={[]}> is banned\nconst a = "<ContextMenu />";').menus).toBe(0);
    expect(scan('const a = <ContextMenuHost />;').menus).toBe(0);
    expect(scan('const a = <div onContextMenu={f} />;').handlers).toBe(1);
    expect(scan("document.addEventListener('contextmenu', f);").handlers).toBe(1);
    expect(scan("document.addEventListener('keydown', f);").handlers).toBe(0);
    expect(scan('// onContextMenu\nconst a = "addEventListener(\'contextmenu\')";').handlers).toBe(0);
  });

  test('entries-name-their-deleter', () => {
    const source = readFileSync(join(__dirname, 'contextMenuSites.test.ts'), 'utf8');
    for (const file of Object.keys(MENU_CEILING)) {
      const line = source.split('\n').findIndex((text) => text.includes(`'${file}':`));
      expect(line, file).toBeGreaterThan(0);
      const comment = source
        .split('\n')
        .slice(Math.max(0, line - 3), line)
        .join('\n');
      expect(comment, `${file} needs a comment naming the swap slice that deletes it`).toMatch(/\bSNE-\d+/);
    }
  });
});
