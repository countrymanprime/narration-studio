import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// #3016: a journal command that touches the DAW (`daw` anything but literally false) either names the action the DAW would have on top of its undo
// history (`dawAction`), so the journal can ask the DAW before it runs the inverse, or says why it cannot be undone (`notUndoableReason`). One that
// does neither with an inverse is refused every time: the journal asks the DAW about no kind and the DAW "cannot say". This reads the sources, so a
// new command that forgets both fails here, with no list of exceptions to add it to.

const ROOT = join(__dirname, '..', '..', '..');
const SKIP = /(\.test\.|\.stories\.|\/fixtures\/|\/tests\/)/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !SKIP.test(path) ? [path] : [];
  });
}

/** Every property name written anywhere inside the literal, a conditional spread's branches included. */
function names(node: ts.Node, into: Set<string>): void {
  if (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isShorthandPropertyAssignment(node)) {
    if (ts.isIdentifier(node.name)) into.add(node.name.text);
  }
  ts.forEachChild(node, (child) => names(child, into));
}

const isFalse = (e: ts.Expression) => e.kind === ts.SyntaxKind.FalseKeyword;

function commandsWithoutADawAction(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const own = new Map<string, ts.Expression | undefined>();
      for (const p of node.properties) {
        if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) own.set(p.name.text, p.initializer);
        if (ts.isMethodDeclaration(p) && ts.isIdentifier(p.name)) own.set(p.name.text, undefined);
      }
      const daw = own.get('daw');
      // A journal command: it lists what it touches, says whether it is a DAW change and runs. A nested object literal is judged on its own.
      if (own.has('touches') && own.has('run') && daw && !isFalse(daw)) {
        const all = new Set<string>();
        names(node, all);
        if (!all.has('dawAction') && !all.has('notUndoableReason')) {
          found.push(`${relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('journal commands that touch the DAW', () => {
  it('each names its dawAction or says why it cannot be undone', () => {
    const bad = sources(join(ROOT, 'src')).flatMap(commandsWithoutADawAction);
    expect(bad, 'a `daw` command with neither dawAction nor notUndoableReason is refused every time it is undone').toEqual([]);
  });
});
