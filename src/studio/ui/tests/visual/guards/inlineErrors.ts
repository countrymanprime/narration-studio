import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const SRC = join(import.meta.dirname, '..', '..', '..', 'src');

/** Files whose whole output is an overlay or the toast itself: an error there cannot move the page under it. */
const OVERLAY_FILE = /(Dialog|Confirm|Menu|Popover|SlideOver|Toast)\.tsx$/;

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) && !OVERLAY_FILE.test(name) ? [path] : [];
  });

/** How many `role="alert"` elements each file draws in a page's flow, by path from src/. A file with none is absent. */
export function inlineErrorCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const path of sources(SRC)) {
    const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let n = 0;
    const visit = (node: ts.Node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.attributes.properties.some(isAlertRole)) n++;
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (n > 0) counts[relative(SRC, path).split('\\').join('/')] = n;
  }
  return counts;
}

const isAlertRole = (p: ts.JsxAttributeLike): boolean =>
  ts.isJsxAttribute(p) && p.name.getText() === 'role' && p.initializer !== undefined && /["']alert["']/.test(p.initializer.getText());
