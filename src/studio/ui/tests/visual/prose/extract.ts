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
const OVERLAY_TAG = /^(Dialog|ConfirmDialog|WorkDialog|SlideOver|Popover|Menu|ContextMenu|Tooltip|BaseDialog|AlertDialog)(\.|$)/;
/** A file whose whole output is an overlay's body (a confirm's text, a dialog). */
const OVERLAY_FILE = /(Dialog|Confirm|Menu|Popover)\.tsx$/;

/** Attributes whose string is shown to sighted users (as a tooltip, a hint or a description) rather than being a name. */
export const TEXT_ATTRS = new Set(['title', 'aria-description', 'hint', 'tip', 'help', 'description', 'detail', 'note', 'caption', 'placeholder']);

/** Attributes the app shows as a hover or focus hint on a control. */
export const HINT_ATTRS = new Set(['title', 'hint', 'disabledReason', 'reason']);

export const SRC = join(import.meta.dirname, '..', '..', '..', 'src');

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

const opening = (el: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxOpeningLikeElement => (ts.isJsxElement(el) ? el.openingElement : el);

/** Every text run in one source file. */
export function extractFile(path: string, code = readFileSync(path, 'utf8')): ProseHit[] {
  const sf = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const file = relative(SRC, path).split('\\').join('/');
  const hits: ProseHit[] = [];
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
  return hits;
}

/** Every text run in the app's components and pages (tests and stories excluded). */
export const extractAll = (): ProseHit[] => sources(SRC).flatMap((p) => extractFile(p));

/** Long enough or sentence-shaped enough to read as prose rather than a label: over 60 characters, or two sentences. */
export const isProse = (text: string): boolean => text.length > 60 || /[.!?;:]\s+\S.*[.!?]$/.test(text);
