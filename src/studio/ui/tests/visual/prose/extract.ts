import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/** One run of text the app can draw: an element's own text children joined, or a text-bearing attribute. */
export type ProseHit = {
  /** Path from src/, posix. */
  file: string;
  line: number;
  /** `text` for JSX children, else the attribute's name (`title`, `aria-description`, a `hint` prop). */
  kind: string;
  /** The text with each `{expression}` replaced by `…`. */
  text: string;
  /** True when the element or an ancestor is screen-reader only (`sr-only`), so it takes no layout space. */
  srOnly: boolean;
  /** True when it is drawn inside an overlay (a dialog, menu, popover, tooltip or slide-over), so it cannot move the page under it. */
  overlay: boolean;
};

/** The elements that draw over the page instead of in it. */
const OVERLAY_TAG = /^(HelpButton|Dialog|ConfirmDialog|WorkDialog|SlideOver|Popover|Menu|ContextMenu|Tooltip|BaseDialog|AlertDialog)(\.|$)/;
/** A file whose whole output is an overlay's body (a confirm's text, a dialog). */
const OVERLAY_FILE = /(Dialog|Confirm|Menu|Popover)\.tsx$/;

/** Attributes whose string is shown to sighted users (as a tooltip, a hint or a description) rather than being a name. */
export const TEXT_ATTRS = new Set(['title', 'aria-description', 'hint', 'tip', 'help', 'description', 'detail', 'note', 'caption', 'placeholder']);

/** Attributes the app shows as a hover or focus hint on a control. */
export const HINT_ATTRS = new Set(['title', 'hint', 'disabledReason', 'reason']);

const SRC = join(import.meta.dirname, '..', '..', '..', 'src');

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) ? [path] : [];
  });

const literal = (node: ts.Node): string | null => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => `…${s.literal.text}`).join('');
  if (ts.isParenthesizedExpression(node)) return literal(node.expression);
  return null;
};

const classOf = (el: ts.JsxOpeningLikeElement): string => {
  for (const p of el.attributes.properties) {
    if (ts.isJsxAttribute(p) && p.name.getText() === 'className' && p.initializer) {
      const init = p.initializer;
      if (ts.isStringLiteral(init)) return init.text;
      if (ts.isJsxExpression(init) && init.expression) return init.expression.getText();
    }
  }
  return '';
};

const isStringNode = (n: ts.Node): boolean => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);

/** Every string a `{expression}` child can draw: the branches of `?:`, `&&`, `||`, `??`, and the strings a same-file constant or helper builds. */
function drawnStrings(expr: ts.Expression, sf: ts.SourceFile, seen = new Set<string>()): ts.Node[] {
  if (ts.isParenthesizedExpression(expr)) return drawnStrings(expr.expression, sf, seen);
  if (isStringNode(expr)) return [expr];
  if (ts.isConditionalExpression(expr)) return [expr.whenTrue, expr.whenFalse].flatMap((e) => drawnStrings(e, sf, seen));
  if (ts.isBinaryExpression(expr)) {
    const k = expr.operatorToken.kind;
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) return drawnStrings(expr.right, sf, seen);
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return [expr.left, expr.right].flatMap((e) => drawnStrings(e, sf, seen));
    return [];
  }
  const name = ts.isIdentifier(expr) ? expr.text : ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) ? expr.expression.text : null;
  if (!name || seen.has(name)) return [];
  seen.add(name);
  const found: ts.Node[] = [];
  const scan = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) found.push(...returned(n.initializer, sf, seen));
    else if (ts.isFunctionDeclaration(n) && n.name?.text === name && n.body) found.push(...returned(n.body, sf, seen));
    ts.forEachChild(n, scan);
  };
  scan(sf);
  return found;
}

/** The strings a declaration's value can be: its expression's, or each `return` of a function body. */
function returned(n: ts.Node, sf: ts.SourceFile, seen: Set<string>): ts.Node[] {
  if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return returned(n.body, sf, seen);
  if (ts.isBlock(n)) {
    const out: ts.Node[] = [];
    const walk = (c: ts.Node) => {
      if (ts.isFunctionLike(c)) return;
      if (ts.isReturnStatement(c) && c.expression) out.push(...drawnStrings(c.expression, sf, seen));
      ts.forEachChild(c, walk);
    };
    ts.forEachChild(n, walk);
    return out;
  }
  return ts.isExpression(n) ? drawnStrings(n, sf, seen) : [];
}

const opening = (el: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxOpeningLikeElement => (ts.isJsxElement(el) ? el.openingElement : el);

/** Every text run in one source file. */
export function extractFile(path: string, code = readFileSync(path, 'utf8')): ProseHit[] {
  const sf = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const file = relative(SRC, path).split('\\').join('/');
  const hits: ProseHit[] = [];
  const extra: ProseHit[] = [];
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (node: ts.Node, srOnly: boolean, inOverlay: boolean) => {
    let sr = srOnly;
    let over = inOverlay;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = opening(node);
      sr = sr || /\bsr-only\b/.test(classOf(open));
      over = over || OVERLAY_TAG.test(open.tagName.getText());
      for (const p of open.attributes.properties) {
        if (!ts.isJsxAttribute(p) || !p.initializer) continue;
        const name = p.name.getText();
        const tag = open.tagName.getText();
        const tooltipText = name === 'text' && (tag === 'Tooltip' || tag === 'TooltipTarget');
        if (!TEXT_ATTRS.has(name) && !HINT_ATTRS.has(name) && !tooltipText) continue;
        const init = p.initializer;
        const text = ts.isStringLiteral(init) ? init.text : ts.isJsxExpression(init) && init.expression ? literal(init.expression) : null;
        if (text) hits.push({ file, line: lineOf(p), kind: tooltipText ? 'tooltip' : name, text, srOnly: sr, overlay: over });
      }
      if (ts.isJsxElement(node)) {
        // An element's own text: its text children and literal {expressions}, joined; a child element counts as a gap.
        const parts: string[] = [];
        let any = false;
        for (const c of node.children) {
          if (ts.isJsxText(c)) {
            const t = c.text.replace(/\s+/g, ' ');
            if (t.trim()) any = true;
            parts.push(t);
          } else if (ts.isJsxExpression(c) && c.expression) {
            const t = literal(c.expression);
            // A branch or helper the literal pass cannot join into this element's text is its own run.
            if (t === null) {
              for (const str of drawnStrings(c.expression, sf)) {
                const text = literal(str);
                if (text) extra.push({ file, line: lineOf(str), kind: 'text', text, srOnly: sr, overlay: over });
              }
            }
            if (t !== null) {
              any = true;
              parts.push(t);
            } else parts.push('…');
          } else parts.push(' … ');
        }
        const text = parts
          .join('')
          .replace(/\s+/g, ' ')
          .replace(/^(\s|…)+|(\s|…)+$/g, '')
          .trim();
        if (any && text) hits.push({ file, line: lineOf(node), kind: 'text', text, srOnly: sr, overlay: over });
      }
    }
    ts.forEachChild(node, (c) => visit(c, sr, over));
  };
  visit(sf, false, OVERLAY_FILE.test(path));
  const seenAt = new Set<string>();
  return [...hits, ...extra].filter((h) => !seenAt.has(`${h.line}|${h.text}`) && !!seenAt.add(`${h.line}|${h.text}`));
}

/** Every text run in the app's components and pages (tests and stories excluded). */
export const extractAll = (): ProseHit[] => sources(SRC).flatMap((p) => extractFile(p));

/** Long enough or sentence-shaped enough to read as prose rather than a label: over 60 characters, or two sentences (20 characters or more, so an abbreviated header such as "Rec. / Est." is not one). */
export const isProse = (text: string): boolean => text.length > 60 || (text.length >= 20 && /[.!?;:]\s+\S.*[.!?]$/.test(text));
