import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/** The states of one conditional that draw an `IconButton` in one state and a confirm-type `Button` with words in another. */
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
  ts.isStringLiteralLike(e) || ts.isTemplateExpression(e)
    ? [ts.isTemplateExpression(e) ? e.getText() : e.text]
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

/**
 * The words that finish an edit, answer a question or start the one thing a control does (Show, Download, Repair, Retry): Confirm, Save, Apply, Cancel, Done, Discard, Keep, Yes, No, or a question
 * ("Remove 2 uses too?"). The owner's complaint is an icon that starts a change beside a word that commits it. A word that names a
 * different action (Override for this project, Move them out…, Change location…) is a bare word no icon carries (frontend-primitives rule 1).
 */
const COMMIT_WORD = /^`?(confirm|save|apply|cancel|done|discard|keep|yes|no|show|download|repair|retry|try)\b|\?`?$/i;

type Found = { icons: string[]; words: string[] };

/** Collects the buttons a parent's children draw, looking through fragments, conditionals and `&&`, but not into other elements. */
function collect(node: ts.Node, into: Found): void {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tag = tagOf(node);
    if (tag === 'IconButton') into.icons.push(iconName(node));
    else if (tag === 'Button') {
      const words = ts.isJsxElement(node) ? wordsOf(node) : '';
      if (COMMIT_WORD.test(words)) into.words.push(words);
    }
    if (ts.isJsxElement(node) && tag !== 'Button') node.children.forEach((c) => collect(c, into)); // a wrapper holds its state's buttons too
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
    // The top of a chain only: `a ? x : b ? y : z` is one set of states, and a state is one branch.
    if (ts.isConditionalExpression(node) && !ts.isConditionalExpression(node.parent)) {
      const branches: Found[] = [];
      const leaves = (e: ts.Expression) => {
        const inner = ts.isParenthesizedExpression(e) ? e.expression : e;
        if (ts.isConditionalExpression(inner)) {
          leaves(inner.whenTrue);
          leaves(inner.whenFalse);
        } else {
          const found: Found = { icons: [], words: [] };
          collect(inner, found);
          branches.push(found);
        }
      };
      leaves(node);
      // Words in one state and an icon in another. Both kinds side by side in one state are separate controls, not states.
      const wordsAt = branches.findIndex((branch) => branch.words.length > 0);
      const mixes = branches.some((branch, at) => branch.icons.length > 0 && branches.some((other, otherAt) => otherAt !== at && other.words.length > 0));
      if (wordsAt >= 0 && mixes) {
        out.push({
          file,
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          icons: branches.flatMap((b) => b.icons),
          words: branches.flatMap((b) => b.words),
        });
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
