// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Class guard for #3426 ("chapter pipeline: chapter column should be left aligned"): the Chapter cell of the pipeline carried a page-local `text-center`.
// Headers are centred by the header primitive (owner rule); the cells of a column of names, text or titles are left aligned. A page that wants a centred
// cell passes `align="center"` (a number, a status or a lone control), never a `text-center` class on a `TableCell` or `td`. The allowlist only shrinks.

const SRC = __dirname;
const ALLOWED: Record<string, string> = {
  'components/storybible/EntryTable.tsx#1': 'the cell holds one icon button (Hear), not text',
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/.test(entry.name) && !/\.(test|stories)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

/** The `TableCell`/`td` elements of a source text whose attributes spell `text-center`, in source order. */
function centredCells(text: string): number {
  const file = ts.createSourceFile('x.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = 0;
  const visit = (node: ts.Node) => {
    const tag = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
    if (tag && /^(TableCell|td)$/.test(tag.tagName.getText(file)) && /(^|[\s"'`])text-center(?=$|[\s"'`])/.test(tag.attributes.getText(file))) found += 1;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('table cells are not centred by a class', () => {
  it('sees every spelling of a centred cell', () => {
    expect(centredCells('const a = <TableCell className="text-center font-medium">x</TableCell>;')).toBe(1);
    expect(centredCells('const a = <td className={`w-4 text-center ${x}`}>x</td>;')).toBe(1);
    expect(centredCells("const a = <TableCell className={cond ? 'text-center' : ''} />;")).toBe(1);
    expect(centredCells('const a = <TableCell align="center">x</TableCell>;')).toBe(0);
    expect(centredCells('const a = <div className="text-center">x</div>;')).toBe(0);
  });

  it('finds none outside the allowlist', () => {
    const hits = sources(SRC).flatMap((path) => {
      const name = relative(SRC, path).split(sep).join('/');
      return Array.from({ length: centredCells(readFileSync(path, 'utf8')) }, (_, i) => `${name}#${i + 1}`);
    });
    expect(hits.filter((hit) => !(hit in ALLOWED))).toEqual([]);
    expect(
      Object.keys(ALLOWED).filter((key) => !hits.includes(key)),
      'an allowlist entry that no longer hits: delete it',
    ).toEqual([]);
  });
});
