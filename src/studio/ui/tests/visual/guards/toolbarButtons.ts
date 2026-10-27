import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/** A `Button` that draws words inside a toolbar or ribbon. */
export type ToolbarTextButton = { file: string; line: number; text: string };

const SRC = join(import.meta.dirname, '..', '..', '..', 'src');

/** Files whose buttons sit in a toolbar although the `Toolbar` is drawn by another file (a button a bar renders for its caller). */
const TOOLBAR_FILE = /(^|\/)(editing\/bar\/|[^/]*Toolbar[^/]*|[^/]*Ribbon[^/]*|CutButtons)\.?[^/]*$/;

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) && !path.includes('/primitives/') ? [path] : [];
  });

const tagOf = (n: ts.JsxElement | ts.JsxSelfClosingElement): string => (ts.isJsxElement(n) ? n.openingElement : n).tagName.getText();

const isToolbar = (n: ts.JsxElement | ts.JsxSelfClosingElement): boolean => {
  const open = ts.isJsxElement(n) ? n.openingElement : n;
  return (
    /^(Toolbar|ToolbarButton)$/.test(tagOf(n)) ||
    open.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText() === 'role' && p.initializer?.getText().includes('toolbar'))
  );
};

/** The words an expression draws: a string literal, or the literal branches of a conditional (`short ? 'Delete' : 'Delete words'`). */
const literalWords = (e: ts.Expression): string[] =>
  ts.isStringLiteralLike(e)
    ? [e.text]
    : ts.isConditionalExpression(e)
      ? [...literalWords(e.whenTrue), ...literalWords(e.whenFalse)]
      : ts.isParenthesizedExpression(e)
        ? literalWords(e.expression)
        : [];

/** The words a button's children draw: JSX text and string literals, not an `Icon` or a `Kbd`. */
const wordsOf = (el: ts.JsxElement): string =>
  el.children
    .flatMap((c) => (ts.isJsxText(c) ? [c.text] : ts.isJsxExpression(c) && c.expression ? literalWords(c.expression) : []))
    .join(' | ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s|]+|[\s|]+$/g, '')
    .trim();

function scan(path: string): ToolbarTextButton[] {
  const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const file = relative(SRC, path).split('\\').join('/');
  const inFile = TOOLBAR_FILE.test(file);
  const hits: ToolbarTextButton[] = [];
  const visit = (node: ts.Node, inToolbar: boolean) => {
    let within = inToolbar;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      within = within || isToolbar(node);
      if (ts.isJsxElement(node) && tagOf(node) === 'Button' && (within || inFile)) {
        const text = wordsOf(node);
        if (text) hits.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text });
      }
    }
    ts.forEachChild(node, (c) => visit(c, within));
  };
  visit(sf, false);
  return hits;
}

/** Every text `Button` the app draws in a toolbar or ribbon (tests and stories excluded). */
export const toolbarTextButtons = (): ToolbarTextButton[] => sources(SRC).flatMap(scan);
