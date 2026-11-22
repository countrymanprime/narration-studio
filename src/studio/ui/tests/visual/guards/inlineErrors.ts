import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const SRC = join(import.meta.dirname, '..', '..', '..', 'src');

/** Files whose whole output is an overlay or the toast itself: an error there cannot move the page under it. */
const OVERLAY_FILE = /(Dialog|Confirm|Menu|Popover|SlideOver|Toast)\.tsx$/;

/** Elements that draw their children in an overlay: an error inside one, in the same file, cannot move the page under it. */
const OVERLAY_TAGS = new Set(['Dialog', 'ConfirmDialog', 'WorkDialog', 'SlideOver', 'NavDrawer', 'Popover', 'Menu', 'ContextMenu', 'Toast']);

/**
 * Files drawn only inside an overlay that another file opens, so the overlay element is not in them. Each says where it is drawn.
 * The list may only shrink: a file that gains a caller in a page's flow comes off it (inlineErrors.test.ts checks every entry still exists).
 */
export const DRAWN_IN_OVERLAY: Record<string, string> = {
  'components/recordingcheck/CheckResult.tsx': 'the result step of CheckRecordingsDialog',
  'components/recordingcheck/RunningView.tsx': 'the running step of CheckRecordingsDialog',
  'components/proof/proofOptions/ProofOptions.tsx': 'the body of the proof options dialogs (ProofOptionsDialog, CompareOptionsDialog)',
  'components/engine/ToolResult.tsx': 'the result box of the five engine tool dialogs',
  'components/recordingcheck/RunOptions.tsx': 'the options step of CheckRecordingsDialog',
  'components/pickups/list/AddPickup.tsx': 'the Add a pickup by hand popover of PickupsTable',
  'components/mapping/ChapterTrackLinkFix.tsx': 'CheckResult (in CheckRecordingsDialog) and the EditingCheckPanel slide-over',
};

/** A danger or warning text colour, as a class or a style value (a fill, ring or badge dot is not text). */
const DANGER_COLOUR = /text-\[var\(--(danger|warn)(-text)?\)\]|color:\s*['"`]var\(--(danger|warn)(-text)?\)|\btext-(danger|warn)\b/;
/** Text that is read only by a screen reader takes no room. */
const SCREEN_READER_ONLY = /\bsr-only\b/;
/** A slot that keeps its height in every state: a `min-h-` other than 0 or full. */
const FIXED_SLOT = /\bmin-h-(?!0\b|full\b|screen\b)/;
/**
 * A variable whose text is an error, read from its last name: `error`, `saveError`, `state.problem`, `refreshFailure`, `read.trouble`. A
 * `reason`, `notice` or `message` is not one by its name alone (a disabled control's reason, a job's progress line); it counts when its
 * element has an error colour, tone or role, or when the condition it is drawn under names an error.
 */
const ERROR_NAME = /^err$|error|problem|failure|failed|trouble/i;
/** A condition that names an error: the element under it is drawn only when something went wrong. */
/** Words that say something failed, in an element's own text. */
const BUTTONS = new Set(['Button', 'IconButton', 'button']);
const FAILURE_TEXT = /\b(could not|couldn(&apos;|['’])t|can(&apos;|['’])t|cannot be (read|listed|reached|saved|found)|failed|did not|was not saved)\b/i;
const ERROR_CONDITION = /error|problem|failure|failed|trouble|notice$|cantTell|refused/i;
/**
 * Components that draw a failure notice, from the audit (docs/research/2026-11-inline-error-audit.md), so a caller that draws one under a
 * condition counts even though the notice's own markup is in another file.
 */
const NOTICE_COMPONENTS = new Set([
  'ReadNotice',
  'EditOffNotice',
  'ChapterLinkNotice',
  'NoAudioBanner',
  'UnresolvedCreditsWarning',
  'LinkProblem',
  'CantTell',
  'PrepStatus',
]);
/** Badges are a fixed cue in a row or a header, not a line of text (frontend-primitives rule 7, "a badge with a tooltip"). */
const BADGES = new Set(['StatusBadge', 'HeaderChip', 'KindChip', 'Pill']);
/** Screens that replace a whole page or route on a failed read, by design (design-system.md#errors). */
const WHOLE_PAGE = new Set(['LoadError', 'LoadErrorPanel', 'BoothUnavailable']);

/** Why an element counts as an error drawn in a page's flow. */
export type InlineErrorFinding = { file: string; line: number; why: string };

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) && !OVERLAY_FILE.test(name) ? [path] : [];
  });

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment;
const isJsx = (node: ts.Node): node is Jsx => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
const opening = (node: Jsx): ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined =>
  ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
const tagName = (node: Jsx): string => opening(node)?.tagName.getText().split('.')[0] ?? '';

const attribute = (node: Jsx, name: string): ts.JsxAttribute | undefined =>
  opening(node)?.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name);
/** An attribute's literal text, or the source of its expression. */
const attributeText = (attr: ts.JsxAttribute | undefined): string | undefined => {
  if (!attr) return undefined;
  if (!attr.initializer) return 'true';
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  return attr.initializer.getText();
};
const classText = (node: Jsx): string => `${attributeText(attribute(node, 'className')) ?? ''} ${attributeText(attribute(node, 'style')) ?? ''}`;
const isFixedSlot = (node: Jsx): boolean => FIXED_SLOT.test(classText(node));
const isScreenReaderOnly = (node: Jsx): boolean => SCREEN_READER_ONLY.test(classText(node));
/** The JSX element this one is drawn in, in this file, or the element itself at the top. */
const parentElement = (node: Jsx): Jsx => {
  for (let up = node.parent; up && !ts.isSourceFile(up); up = up.parent) if (isJsx(up)) return up;
  return node;
};

const lastName = (expr: ts.Expression): string | undefined => {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text === 'length' ? lastName(expr.expression) : expr.name.text;
  if (ts.isParenthesizedExpression(expr) || ts.isNonNullExpression(expr)) return lastName(expr.expression);
  return undefined;
};
/** `{error}` or `{state.problem}` as a direct child. */
const showsErrorText = (node: Jsx): boolean =>
  !ts.isJsxSelfClosingElement(node) &&
  node.children.some((c) => ts.isJsxExpression(c) && c.expression !== undefined && ERROR_NAME.test(lastName(c.expression) ?? ''));
const isFieldError = (node: Jsx): boolean => tagName(node) === 'Field' && attribute(node, 'error') !== undefined;

/** What on this element alone marks it as an error, or undefined. In a table cell a colour or tone is the row's data, not an error. */
function signal(node: Jsx, inCell: boolean): string | undefined {
  if (attributeText(attribute(node, 'role')) === 'alert') return 'role="alert"';
  if (!inCell && DANGER_COLOUR.test(classText(node))) return 'danger or warn colour';
  const tone = attributeText(attribute(node, 'tone'));
  if (!inCell && tone && /^(danger|warning|warn|error|alert)$/.test(tone) && !BADGES.has(tagName(node))) return `tone="${tone}"`;
  if (tagName(node) === 'Note' && attribute(node, 'alert')) return 'Note alert';
  if (isFieldError(node)) return 'Field error';
  if (NOTICE_COMPONENTS.has(tagName(node))) return `<${tagName(node)}>`;
  if (showsErrorText(node)) return 'error-named text';
  if (!ts.isJsxSelfClosingElement(node) && !BUTTONS.has(tagName(node)) && node.children.some((c) => ts.isJsxText(c) && FAILURE_TEXT.test(c.text)))
    return 'failure sentence';
  return undefined;
}

const OR_AND = [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken];

const skipParens = (node: ts.Node): ts.Node => (ts.isParenthesizedExpression(node) ? skipParens(node.expression) : node);
/** The tag names a branch of `?:` draws, or undefined when a branch draws nothing or is not JSX. */
const branchTags = (node: ts.Node): string[] | undefined => {
  const n = skipParens(node);
  if (ts.isConditionalExpression(n)) {
    const [a, b] = [branchTags(n.whenTrue), branchTags(n.whenFalse)];
    return a && b ? [...a, ...b] : undefined;
  }
  return isJsx(n) ? [tagName(n)] : undefined;
};
/** Inline text elements: one in place of another moves at most the words after it on the same line. */
const INLINE = new Set(['span', 'b', 'strong', 'em', 'code']);
/** `a ? <span>…</span> : <span>…</span>`: every state draws the same inline element, so one swaps for the other in place. */
const isSwap = (p: ts.ConditionalExpression): boolean => {
  let top: ts.Node = p;
  while (ts.isParenthesizedExpression(top.parent) || (ts.isConditionalExpression(top.parent) && top.parent.condition !== top)) top = top.parent;
  const tags = branchTags(top);
  return tags !== undefined && new Set(tags).size === 1 && INLINE.has(tags[0] ?? '');
};

/** How the element is drawn only in some states, or undefined when it is always drawn. */
type Condition = { test?: ts.Expression; whenTrue: boolean; earlyReturn?: boolean };
/** The element is drawn only in some states: an operand of `&&`, `||`, `??` or `?:` (not a swap of like elements), or an early return inside an `if` or `switch`. */
function condition(node: Jsx): Condition | undefined {
  let child: ts.Node = node;
  let p = node.parent;
  while (ts.isParenthesizedExpression(p)) [child, p] = [p, p.parent];
  if (ts.isBinaryExpression(p)) {
    if (p.right !== child || !OR_AND.includes(p.operatorToken.kind)) return undefined;
    return { test: p.left, whenTrue: p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken };
  }
  if (ts.isConditionalExpression(p)) {
    if (p.condition === child || isSwap(p)) return undefined;
    return { test: p.condition, whenTrue: p.whenTrue === child };
  }
  if (!ts.isReturnStatement(p)) return undefined;
  for (let up: ts.Node = p.parent; !ts.isFunctionLike(up) && !ts.isSourceFile(up); up = up.parent) {
    if (ts.isIfStatement(up)) return { test: up.expression, whenTrue: !up.elseStatement || isWithin(p, up.thenStatement), earlyReturn: true };
    if (ts.isCaseClause(up) || ts.isDefaultClause(up)) return { whenTrue: false, earlyReturn: true };
  }
  return undefined;
}
const isWithin = (node: ts.Node, outer: ts.Node): boolean => node.pos >= outer.pos && node.end <= outer.end;
const isConditional = (node: Jsx): boolean => condition(node) !== undefined;
/** One branch of a swap: it takes the place of a like element in the other states. */
const isSwapBranch = (node: Jsx): boolean => {
  let p = node.parent;
  while (ts.isParenthesizedExpression(p)) p = p.parent;
  return ts.isConditionalExpression(p) && p.condition !== node && isSwap(p);
};
const EQUALS = [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken];
/** The test holds when something went wrong: an error-named value is set (`saveError`, `read.trouble`), a phase is `'error'` or `'failed'`. */
function testsError(expr: ts.Expression): boolean {
  const e = skipParens(expr) as ts.Expression;
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return testsError(e.left) || testsError(e.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return testsError(e.left) && testsError(e.right);
    if (EQUALS.includes(op)) return [e.left, e.right].some((side) => (ts.isStringLiteral(side) ? ERROR_CONDITION.test(side.text) : testsError(side)));
    if (op === ts.SyntaxKind.GreaterThanToken) return testsError(e.left);
    return false;
  }
  if (ts.isCallExpression(e)) return testsError(e.expression);
  const name = lastName(e);
  return name !== undefined && ERROR_CONDITION.test(name);
}
/** The condition the element is drawn under names an error, and it is drawn when that is true: `{saveError && <p>…</p>}`. */
const namesError = (c: Condition): boolean => c.whenTrue && c.test !== undefined && testsError(c.test);

const isOverlay = (el: Jsx): boolean => OVERLAY_TAGS.has(tagName(el));
/** A badge, or a tooltip target or span around badges and icon buttons: a cue with its reason in the tooltip. */
const isBadge = (el: Jsx): boolean =>
  BADGES.has(tagName(el)) ||
  (['TooltipTarget', 'span'].includes(tagName(el)) &&
    ts.isJsxElement(el) &&
    el.children.every((c) =>
      ts.isJsxText(c) ? c.text.trim() === '' : isJsx(c) && (BADGES.has(tagName(c)) || tagName(c) === 'IconButton' || isScreenReaderOnly(c)),
    ));
/** A table cell: a state drawn in a row's own cell is that row's data. */
const isCell = (el: Jsx): boolean => ['TableCell', 'td', 'th'].includes(tagName(el));
const CONTROLS = new Set(['IconButton', '']);
/** Only icon buttons (a Retry and a Dismiss in a row's actions): no text appears. */
const isControlsOnly = (el: Jsx): boolean =>
  CONTROLS.has(tagName(el)) &&
  (!ts.isJsxFragment(el) || el.children.every((c) => (ts.isJsxText(c) ? c.text.trim() === '' : isJsx(c) && CONTROLS.has(tagName(c)))));
const under = (node: ts.Node, test: (el: Jsx) => boolean): boolean => {
  for (let up = node.parent; up && !ts.isSourceFile(up); up = up.parent) if (isJsx(up) && test(up)) return true;
  return false;
};

/**
 * The first element in this subtree (itself included) that marks an error. It does not descend into JSX drawn under a condition of its own
 * (counted on its own), a fixed slot, an overlay or screen-reader-only text. In a view a component returns early it does not descend into a
 * swap branch either: that view is drawn in place of the component's others, and the swap is in place within it.
 */
function firstSignal(root: Jsx, skipSwaps: boolean): string | undefined {
  let found: string | undefined;
  const visit = (node: ts.Node, inCell: boolean) => {
    if (found) return;
    let cell = inCell;
    if (isJsx(node)) {
      if (node !== root && (isConditional(node) || (skipSwaps && isSwapBranch(node)))) return;
      if (isFixedSlot(node) || isOverlay(node) || isScreenReaderOnly(node)) return;
      cell ||= isCell(node);
      found = signal(node, cell);
      if (found) return;
    }
    ts.forEachChild(node, (c) => visit(c, cell));
  };
  visit(root, under(root, isCell));
  return found;
}

/** The element is, or holds, a screen that replaces a page or a section on a failed read. */
function drawsWholePage(root: Jsx): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (isJsx(node) && WHOLE_PAGE.has(tagName(node))) found = true;
    else ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/** Why this element, outside any overlay or fixed slot, counts as an error in a page's flow, or undefined. */
function inFlowError(node: Jsx): string | undefined {
  const c = condition(node);
  if (c) {
    if (drawsWholePage(node) || isBadge(node)) return undefined;
    const why = firstSignal(node, c.earlyReturn === true) ?? (namesError(c) && !isControlsOnly(node) ? `under ${c.test?.getText().slice(0, 60)}` : undefined);
    return why && `drawn in some states, ${why}`;
  }
  if (attributeText(attribute(node, 'role')) === 'alert') return 'role="alert"';
  if (showsErrorText(node)) return 'error-named text, empty until the error comes';
  if (isFieldError(node)) return 'Field error, its line drawn only when set';
  return undefined;
}

/** A component the file declares at its top level, by name, with the node that holds its body. */
function localComponents(sf: ts.SourceFile): Map<string, ts.Node> {
  const found = new Map<string, ts.Node>();
  for (const st of sf.statements) {
    const exported = ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported) continue;
    if (ts.isFunctionDeclaration(st) && st.name && /^[A-Z]/.test(st.name.text)) found.set(st.name.text, st);
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && /^[A-Z]/.test(d.name.text) && d.initializer && ts.isArrowFunction(d.initializer)) found.set(d.name.text, d.initializer);
  }
  return found;
}

/**
 * The bodies of the file's own components (not exported) that it draws only inside an overlay element, or only inside another such component:
 * `function Row()` drawn in the `<Dialog>` of the same file. An exported component may be drawn anywhere, so it is never one.
 */
function overlayOnlyComponents(sf: ts.SourceFile): Set<ts.Node> {
  const components = localComponents(sf);
  const uses = new Map<string, Jsx[]>();
  const collect = (node: ts.Node) => {
    if (isJsx(node) && components.has(tagName(node))) uses.set(tagName(node), [...(uses.get(tagName(node)) ?? []), node]);
    ts.forEachChild(node, collect);
  };
  collect(sf);
  const bodies = new Set<ts.Node>();
  const ownerOf = (node: ts.Node): string | undefined => [...components].find(([, body]) => isWithin(node, body))?.[0];
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, body] of components) {
      if (bodies.has(body)) continue;
      const at = uses.get(name) ?? [];
      const owner = (use: Jsx) => ownerOf(use);
      if (at.length > 0 && at.every((use) => under(use, isOverlay) || bodies.has(components.get(owner(use) ?? '') ?? sf))) {
        bodies.add(body);
        grew = true;
      }
    }
  }
  return bodies;
}

/**
 * The errors one source file draws in a page's flow. An element counts when it is drawn only in some states and it, or an element in it,
 * marks an error (`role="alert"`, a danger or warn text colour, a danger or warn tone on a block, `Note alert`, `Field error`, a notice
 * component, a failure sentence, or the text of an error-named variable), or when the condition it is drawn under names an error.
 * Also counted when always drawn: an element showing an error-named variable's text (empty until the error comes), `Field error` (Field draws
 * the line only when set) and `role="alert"`. Not counted: anything inside an overlay element or a component of the file drawn only there,
 * screen-reader-only text, and an element that is or sits directly in a slot with a `min-h-` class. An element inside a counted one is not
 * counted again.
 */
export function scanSource(file: string, text: string): InlineErrorFinding[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: InlineErrorFinding[] = [];
  const inOverlay = overlayOnlyComponents(sf);
  const visit = (node: ts.Node) => {
    if (inOverlay.has(node)) return;
    if (isJsx(node)) {
      if (isOverlay(node) || isScreenReaderOnly(node)) return;
      const why = isFixedSlot(node) || isFixedSlot(parentElement(node)) ? undefined : inFlowError(node);
      if (why) {
        findings.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, why });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/** Every error drawn in a page's flow, by path from src/, outside the overlay files and DRAWN_IN_OVERLAY. */
export function inlineErrorFindings(): InlineErrorFinding[] {
  return sources(SRC).flatMap((path) => {
    const file = relative(SRC, path).split('\\').join('/');
    return file in DRAWN_IN_OVERLAY ? [] : scanSource(file, readFileSync(path, 'utf8'));
  });
}

/** Whether a path from src/ names a file. */
export const sourceExists = (file: string): boolean => {
  try {
    return statSync(join(SRC, file)).isFile();
  } catch {
    return false;
  }
};
