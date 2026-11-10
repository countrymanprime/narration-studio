import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/** The states of one conditional that draw both an `IconButton` and a `Button` with words. */
export type MixedButtons = { file: string; line: number; icons: string[]; words: string[] };

const SRC = join(import.meta.dirname, '..', '..', '..', 'src');

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) && !path.includes('/primitives/') ? [path] : [];
  });

const tagOf = (n: ts.JsxElement | ts.JsxSelfClosingElement): string => (ts.isJsxElement(n) ? n.openingElement : n).tagName.getText();

/** The words an expression draws: a string literal, or the literal branches of a conditional (`repair ? 'Repair' : 'Download'`). */
const literalWords = (e: ts.Expression): string[] =>
  ts.isStringLiteralLike(e)
    ? [e.text]
    : ts.isConditionalExpression(e)
      ? [...literalWords(e.whenTrue), ...literalWords(e.whenFalse)]
      : ts.isParenthesizedExpression(e)
        ? literalWords(e.expression)
        : [];

/** The words a `Button` draws (JSX text and string literals), empty for one that draws only an icon. */
const wordsOf = (el: ts.JsxElement): string =>
  el.children
    .flatMap((c) => (ts.isJsxText(c) ? [c.text] : ts.isJsxExpression(c) && c.expression ? literalWords(c.expression) : []))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

const iconName = (n: ts.JsxElement | ts.JsxSelfClosingElement): string => {
  const open = ts.isJsxElement(n) ? n.openingElement : n;
  const action = open.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === 'action');
  return action && ts.isJsxAttribute(action) && action.initializer ? action.initializer.getText().replace(/["'{}]/g, '') : 'IconButton';
};

type Found = { icons: string[]; words: string[] };

/** Collects the buttons a parent's children draw, looking through fragments, conditionals and `&&`, but not into other elements. */
function collect(node: ts.Node, into: Found): void {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tag = tagOf(node);
    if (tag === 'IconButton') into.icons.push(iconName(node));
    else if (tag === 'Button') {
      const words = ts.isJsxElement(node) ? wordsOf(node) : '';
      if (words) into.words.push(words);
    }
    return;
  }
  if (ts.isJsxFragment(node)) return node.children.forEach((c) => collect(c, into));
  if (ts.isJsxExpression(node) && node.expression) return collect(node.expression, into);
  if (ts.isParenthesizedExpression(node)) return collect(node.expression, into);
  if (ts.isConditionalExpression(node)) {
    collect(node.whenTrue, into);
    collect(node.whenFalse, into);
  } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) collect(node.right, into);
}

/**
 * The conditionals one file's source draws whose branches (the states of one control or panel) mix an icon button and a word button; `file`
 * is its path relative to `src`. Buttons that sit side by side in one state, such as a pin beside an Open, are separate controls and not counted.
 */
export function scanSource(file: string, text: string): MixedButtons[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: MixedButtons[] = [];
  const visit = (node: ts.Node) => {
    // The top of a chain only: `a ? x : b ? y : z` is one set of states.
    if (ts.isConditionalExpression(node) && !ts.isConditionalExpression(node.parent)) {
      const found: Found = { icons: [], words: [] };
      collect(node, found);
      if (found.icons.length > 0 && found.words.length > 0) {
        out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, ...found });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function mixedButtons(): MixedButtons[] {
  return sources(SRC).flatMap((path) => scanSource(relative(SRC, path), readFileSync(path, 'utf8')));
}
