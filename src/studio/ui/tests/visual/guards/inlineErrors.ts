import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const SRC = join(import.meta.dirname, '..', '..', '..', 'src');

/**
 * Elements that draw their children in an overlay: an error inside one cannot move the page under it. Not `SlideOver`: its body is a panel
 * whose own content an error shifts, so it is in scope (#4045).
 */
const OVERLAY_TAGS = new Set(['Dialog', 'ConfirmDialog', 'WorkDialog', 'NavDrawer', 'Popover', 'Menu', 'ContextMenu', 'Toast', 'Tooltip']);
/** Overlays that cover the page and have no trigger in it: all a component returning one draws is in the overlay. */
const MODAL_TAGS = ['Dialog', 'ConfirmDialog', 'WorkDialog', 'NavDrawer'];
const NOT_MODAL = new Set([...OVERLAY_TAGS].filter((tag) => !MODAL_TAGS.includes(tag)));
/** The parts of a Base UI overlay drawn in a layer above the page (`<Popover.Popup>`, `<Drawer.Portal>`), by the last name of a dotted tag. */
const OVERLAY_PARTS = new Set(['Popup', 'Portal', 'Positioner', 'Viewport', 'Backdrop']);

/**
 * Files drawn only inside an overlay that the guard cannot read as such (`knownComponents` learns the others from their callers). Each says
 * where it is drawn. The list may only shrink: a file that gains a caller in a page's flow comes off it. inlineErrors.test.ts checks that every entry exists and
 * still draws an error the exemption hides, and caps the list's length.
 */
export const DRAWN_IN_OVERLAY: Record<string, string> = {
  'components/primitives/Toast.tsx': 'the toast region itself, drawn in a fixed layer above the page',
};

/** A danger or warning text colour, as a class or a style value (a fill, ring or badge dot is not text). */
const DANGER_COLOUR = /text-\[var\(--(danger|warn)(-text)?\)\]|color:\s*['"`]var\(--(danger|warn)(-text)?\)|\btext-(danger|warn)\b/;
/** Text that is read only by a screen reader takes no room: `sr-only` on its own, not `not-sr-only` or a breakpoint's `md:sr-only`. */
const SCREEN_READER_ONLY = /(?:^|[\s'"`{])sr-only(?![\w-])/;
/**
 * A slot that keeps its height in every state: a `min-h-` of at least one spacing step or an arbitrary length, at every width (no `md:`).
 * Not `min-h-0`, `-px`, `-0.5`, `-fit`, `-min`, `-max`, `-auto`, `-full`, `-screen` or a viewport unit: they reserve nothing a line needs.
 */
const FIXED_SLOT = /(?:^|[\s'"`{])min-h-(?:[1-9]\d*(?:\.\d+)?|\[(?!0[a-z%]*\])[^\]\s]+\])(?![\w.-])/;
/** An element that collapses to nothing while its text is empty: the line comes and goes with its message. */
const EMPTY_HIDDEN = /(?:^|[\s'"`{])empty:hidden(?![\w-])/;
/**
 * A variable whose text is an error, read from its last name: `error`, `saveError`, `state.problem`, `refreshFailure`, `read.trouble`. A
 * `reason`, `notice` or `message` is not one by its name alone (a disabled control's reason, a job's progress line); it counts when its
 * element has an error colour, tone or role, or when the condition it is drawn under names an error.
 */
const ERROR_NAME = /^err$|error|problem|failure|failed|trouble/i;
/** A condition that names an error: the element under it is drawn only when something went wrong. */
const ERROR_CONDITION = /error|problem|failure|failed|trouble|notice$|cantTell|refused/i;
/** A name that says there is none: `noErrors`, `isErrorFree`, `withoutProblems`. */
const NOT_ERROR = /^(?:is|has)?(?:[Nn]o|[Nn]on|[Ww]ithout)(?=[A-Z_])|[Ff]ree|[Ww]ithout/;
/** The text of an error object: `error.message`, `e.message`, `failure.detail`. */
const ERROR_TEXT_FIELD = /^(message|detail|text|reason)$/;
/**
 * Words that say something failed. "can't" and "did not" count only with what failed ("can't tell", "did not answer"): "You can't undo this"
 * in a confirm is not an error.
 */
const FAILURE_TEXT =
  /\b(could not|couldn(&apos;|['’])t|cannot be (read|listed|reached|saved|found)|failed|was not saved|did not (answer|respond|start|finish|save|load|open|confirm)|can(&apos;|['’])t (tell|read|reach|find|open|save|load|connect))\b/i;
const BUTTONS = new Set(['Button', 'IconButton', 'button']);
const OR_AND = [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken];
/**
 * Components that draw a failure notice, from the audit (docs/research/2026-11-inline-error-audit.md), whose signal is not on the element they
 * return (they decide inside themselves, or their words alone say it). An exported component every returned element of which carries an
 * error mark is found by `knownComponents` without a list.
 */
const NOTICE_COMPONENTS = [
  'ReadNotice',
  'EditOffNotice',
  'ChapterLinkNotice',
  'NoAudioBanner',
  'UnresolvedCreditsWarning',
  'LinkProblem',
  'CantTell',
  'PrepStatus',
];
/** Badges are a fixed cue in a row or a header, not a line of text (frontend-primitives rule 7, "a badge with a tooltip"). */
const BADGES = new Set(['StatusBadge', 'HeaderChip', 'KindChip', 'Pill']);
/** Screens that replace a whole page or route on a failed read, by design (design-system.md#errors). */
const WHOLE_PAGE = new Set(['LoadError', 'LoadErrorPanel', 'BoothUnavailable']);

/** Why an element counts as an error drawn in a page's flow. */
export type InlineErrorFinding = { file: string; line: number; why: string };

/** What components are, by name, read across files (`knownComponents`). */
export interface KnownComponents {
  overlays: ReadonlySet<string>;
  notices: ReadonlySet<string>;
  /** Exported components every use of which is drawn in an overlay. */
  drawnInOverlay: ReadonlySet<string>;
}
/** The names the guard knows without reading other files. */
const BUILT_IN: KnownComponents = { overlays: OVERLAY_TAGS, notices: new Set(NOTICE_COMPONENTS), drawnInOverlay: new Set() };

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) ? [path] : [];
  });

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment;
const isJsx = (node: ts.Node): node is Jsx => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
const opening = (node: Jsx): ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined =>
  ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
/** The tag's last name: `Dialog` for `<ui.Dialog>`, `Popup` for `<Popover.Popup>`. */
const tagName = (node: Jsx): string => opening(node)?.tagName.getText().split('.').at(-1) ?? '';
const isDotted = (node: Jsx): boolean => opening(node)?.tagName.getText().includes('.') ?? false;

const attribute = (node: Jsx, name: string): ts.JsxAttribute | undefined =>
  opening(node)?.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name);
/** An attribute's literal text (`role="alert"`, `role={'alert'}`), or the source of its expression. */
const attributeText = (attr: ts.JsxAttribute | undefined): string | undefined => {
  if (!attr) return undefined;
  const init = attr.initializer;
  if (!init) return 'true';
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) return init.expression.text;
  return init.getText();
};
const classText = (node: Jsx): string => `${attributeText(attribute(node, 'className')) ?? ''} ${attributeText(attribute(node, 'style')) ?? ''}`;
const isFixedSlot = (node: Jsx): boolean => FIXED_SLOT.test(classText(node));
const isScreenReaderOnly = (node: Jsx): boolean => SCREEN_READER_ONLY.test(classText(node));
/** `role="alert"` or `aria-live="assertive"`: read out at once, as an error is. */
const alertMark = (node: Jsx): string | undefined =>
  attributeText(attribute(node, 'role')) === 'alert'
    ? 'role="alert"'
    : attributeText(attribute(node, 'aria-live')) === 'assertive'
      ? 'aria-live="assertive"'
      : undefined;

const lastName = (expr: ts.Expression): string | undefined => {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text === 'length' ? lastName(expr.expression) : expr.name.text;
  if (ts.isParenthesizedExpression(expr) || ts.isNonNullExpression(expr)) return lastName(expr.expression);
  return undefined;
};
const isErrorName = (name: string | undefined, pattern: RegExp): boolean => name !== undefined && pattern.test(name) && !NOT_ERROR.test(name);
const skipParens = (node: ts.Node): ts.Node => (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) ? skipParens(node.expression) : node);
/** `null`, `undefined`, `false` or an empty string: a branch that draws nothing. */
const isEmptyValue = (node: ts.Node): boolean => {
  const n = skipParens(node);
  return (
    n.kind === ts.SyntaxKind.NullKeyword ||
    n.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isIdentifier(n) && n.text === 'undefined') ||
    (ts.isStringLiteralLike(n) && n.text.trim() === '')
  );
};
const isLiteral = (node: ts.Node): boolean => {
  const n = skipParens(node);
  return isEmptyValue(n) || ts.isStringLiteralLike(n) || ts.isNumericLiteral(n) || n.kind === ts.SyntaxKind.TrueKeyword;
};
const literalText = (node: ts.Node): string | undefined => {
  const n = skipParens(node);
  return ts.isStringLiteralLike(n) ? n.text : undefined;
};

/** Words, not an element or a call: a string, a template, a name or a property. */
const isWords = (node: ts.Node): boolean => {
  const n = skipParens(node);
  return (ts.isStringLiteralLike(n) && n.text.trim() !== '') || ts.isTemplateExpression(n) || ts.isIdentifier(n) || ts.isPropertyAccessExpression(n);
};

/**
 * The expression is an error's text in the states where something failed and nothing otherwise: `error`, `error?.message`, `e.message`,
 * `` `Failed: ${error}` ``, `String(error ?? '')`, `saveError && 'Could not save'`, `saveError ? 'Could not save' : null`.
 */
function errorText(node: ts.Node): boolean {
  const e = skipParens(node);
  if (ts.isPropertyAccessExpression(e) && ERROR_TEXT_FIELD.test(e.name.text)) {
    const owner = lastName(e.expression);
    if (owner !== undefined && (/^(e|err)$/.test(owner) || isErrorName(owner, ERROR_NAME))) return true;
  }
  if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) return isErrorName(lastName(e), ERROR_NAME);
  if (ts.isTemplateExpression(e)) return e.templateSpans.some((span) => errorText(span.expression));
  if (ts.isCallExpression(e)) return e.arguments.some(errorText);
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    // An element or a call under `&&` is counted as itself (an element, or `errorCall`).
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return isWords(e.right) && (errorText(e.right) || testsError(e.left));
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return errorText(e.left) || errorText(e.right);
    return false;
  }
  if (ts.isConditionalExpression(e)) {
    // Words in both branches swap in place: the line is never empty.
    if (![e.whenTrue, e.whenFalse].every((b) => isWords(b) || isEmptyValue(b))) return false;
    if (!isEmptyValue(e.whenTrue) && !isEmptyValue(e.whenFalse)) return false;
    if (errorText(e.whenTrue) || errorText(e.whenFalse)) return true;
    const failureBranch = [e.whenTrue, e.whenFalse].some((b) => FAILURE_TEXT.test(literalText(b) ?? ''));
    return failureBranch || (testsError(e.condition) && isEmptyValue(e.whenFalse));
  }
  return false;
}
/** `{error}`, `{error?.message}` or another error's text as a direct child. */
const showsErrorText = (node: Jsx): boolean =>
  !ts.isJsxSelfClosingElement(node) && node.children.some((c) => ts.isJsxExpression(c) && c.expression !== undefined && errorText(c.expression));
/** The strings an expression draws: a literal, a template's text, a branch of `?:`, `&&`, `||` or `??` (not a comparison's literal). */
function drawnStrings(node: ts.Node): string[] {
  const n = skipParens(node);
  if (ts.isStringLiteralLike(n)) return [n.text];
  if (ts.isTemplateExpression(n)) return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)];
  if (ts.isConditionalExpression(n)) return [...drawnStrings(n.whenTrue), ...drawnStrings(n.whenFalse)];
  if (ts.isBinaryExpression(n) && OR_AND.includes(n.operatorToken.kind))
    return [...(n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? [] : drawnStrings(n.left)), ...drawnStrings(n.right)];
  return [];
}
/** The words an element shows itself: its text and the strings its expressions draw (not those of another element inside it). */
function ownWords(node: Jsx): string {
  if (ts.isJsxSelfClosingElement(node)) return '';
  return node.children.flatMap((c) => (ts.isJsxText(c) ? [c.text] : ts.isJsxExpression(c) && c.expression ? drawnStrings(c.expression) : [])).join(' ');
}
/** `Field`'s `error`, set to something other than nothing. */
const isFieldError = (node: Jsx): boolean => {
  const error = attribute(node, 'error');
  if (tagName(node) !== 'Field' || !error) return false;
  const init = error.initializer;
  return !(init && ts.isJsxExpression(init) && init.expression && isEmptyValue(init.expression));
};

/** The mark on this element that reads as an error at a glance: an alert role, a danger or warn colour or tone, `Note alert`. */
function errorMark(node: Jsx, inCell: boolean): string | undefined {
  const alert = alertMark(node);
  if (alert) return alert;
  if (!inCell && DANGER_COLOUR.test(classText(node))) return 'danger or warn colour';
  const tone = attributeText(attribute(node, 'tone'));
  if (!inCell && tone && /^(danger|warning|warn|error|alert)$/.test(tone) && !BADGES.has(tagName(node))) return `tone="${tone}"`;
  if (tagName(node) === 'Note' && attribute(node, 'alert')) return 'Note alert';
  return undefined;
}

/** What on this element alone marks it as an error, or undefined. In a table cell a colour or tone is the row's data, not an error. */
function signal(node: Jsx, inCell: boolean, known: KnownComponents): string | undefined {
  const mark = errorMark(node, inCell);
  if (mark) return mark;
  if (isFieldError(node)) return 'Field error';
  if (known.notices.has(tagName(node))) return `<${tagName(node)}>`;
  if (showsErrorText(node)) return 'error-named text';
  if (!BUTTONS.has(tagName(node)) && FAILURE_TEXT.test(ownWords(node))) return 'failure sentence';
  return undefined;
}

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

/**
 * How the element is drawn only in some states, or undefined when it is always drawn. `view`: it is a whole view a component returns in some
 * states in place of its others. `error`: what the state says when it is not read from `test` (a `case 'error':`).
 */
type Condition = { test?: ts.Expression; whenTrue: boolean; view?: boolean; error?: boolean };
const isWithin = (node: ts.Node, outer: ts.Node): boolean => node.pos >= outer.pos && node.end <= outer.end;
const MAPS = new Set(['map', 'flatMap']);

/**
 * The element is drawn only in some states: an operand of `&&`, `||`, `??` or `?:` (not a swap of like elements), an element with a `hidden`
 * expression, an item of a `.map` over an error-named list, a return inside an `if` or a `switch` case, or a return after an `if` that returns.
 * It looks through a callback (`rows.map((r) => …)`) to the call's own place: `{errors.length > 0 && errors.map(…)}` is under its `&&`.
 */
function condition(node: ts.Node): Condition | undefined {
  if (isJsx(node)) {
    const hidden = attribute(node, 'hidden')?.initializer;
    if (hidden && ts.isJsxExpression(hidden) && hidden.expression && !isLiteral(hidden.expression)) return { test: hidden.expression, whenTrue: false };
  }
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
  if (ts.isArrowFunction(p) && p.body === child) return throughCallback(p);
  if (ts.isReturnStatement(p)) return returnCondition(p);
  return undefined;
}

/** A function passed to a call: the items of a `.map` over an error-named list come and go with the list; otherwise the call's own place. */
function throughCallback(fn: ts.ArrowFunction | ts.FunctionExpression): Condition | undefined {
  let at: ts.Node = fn;
  while (ts.isParenthesizedExpression(at.parent)) at = at.parent;
  const call = at.parent;
  if (!ts.isCallExpression(call) || !call.arguments.some((a) => a === at)) return undefined;
  if (ts.isPropertyAccessExpression(call.expression) && MAPS.has(call.expression.name.text)) {
    const list = call.expression.expression;
    if (isErrorName(lastName(list), ERROR_NAME)) return { test: list, whenTrue: true };
  }
  return condition(call);
}

/** The statement returns, itself or in a block under it, not in a function inside it. */
const returns = (st: ts.Node): boolean => {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found || ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n)) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(st);
  return found;
};

/** A return inside an `if` or a `case`, after an `if` that returns, or in a callback: the view it returns is drawn in some states. */
function returnCondition(ret: ts.ReturnStatement): Condition | undefined {
  let from: ts.Node = ret;
  for (let up: ts.Node = ret.parent; !ts.isSourceFile(up); from = up, up = up.parent) {
    if (ts.isArrowFunction(up) || ts.isFunctionExpression(up)) return throughCallback(up);
    if (ts.isFunctionLike(up)) return undefined;
    if (ts.isIfStatement(up)) return { test: up.expression, whenTrue: !up.elseStatement || isWithin(ret, up.thenStatement), view: true };
    if (ts.isCaseClause(up)) return { whenTrue: true, view: true, error: isErrorName(literalText(up.expression), ERROR_CONDITION) };
    if (ts.isDefaultClause(up)) return { whenTrue: false, view: true };
    if (ts.isBlock(up)) {
      const before = up.statements.slice(
        0,
        up.statements.findIndex((st) => isWithin(from, st)),
      );
      const early = before.findLast((st): st is ts.IfStatement => ts.isIfStatement(st) && returns(st));
      if (early) return { test: early.expression, whenTrue: false, view: true };
    }
  }
  return undefined;
}

const isConditional = (node: Jsx): boolean => condition(node) !== undefined;
/** One branch of a swap: it takes the place of a like element in the other states. */
const isSwapBranch = (node: Jsx): boolean => {
  let p = node.parent;
  while (ts.isParenthesizedExpression(p)) p = p.parent;
  return ts.isConditionalExpression(p) && p.condition !== node && isSwap(p);
};
const EQUALS = [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken];
const NOT_EQUALS = [ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken];
const isZero = (node: ts.Node): boolean => {
  const n = skipParens(node);
  return ts.isNumericLiteral(n) && Number(n.text) === 0;
};
/**
 * The test holds when something went wrong: an error-named value is set (`saveError`, `read.trouble`, `errors.length > 0`, `error !== null`),
 * a phase is `'error'` or `'failed'`. A comparison with a literal reads only the literal's side when it is a string (`phase === 'failed'`);
 * `errors.length === 0` and `error === null` say there is none.
 */
function testsError(expr: ts.Expression): boolean {
  const e = skipParens(expr) as ts.Expression;
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return testsError(e.left) || testsError(e.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return testsError(e.left) && testsError(e.right);
    const literal = [e.left, e.right].find(isLiteral);
    const other = literal === e.left ? e.right : e.left;
    if (EQUALS.includes(op)) return literal ? isErrorName(literalText(literal), ERROR_CONDITION) : testsError(e.left) || testsError(e.right);
    if (NOT_EQUALS.includes(op)) return literal !== undefined && (isEmptyValue(literal) || isZero(literal)) && testsError(other);
    if (op === ts.SyntaxKind.GreaterThanToken) return testsError(e.left);
    return false;
  }
  if (ts.isCallExpression(e)) return testsError(e.expression);
  return isErrorName(lastName(e), ERROR_CONDITION);
}
/** The test is false when something went wrong: `!error`, `error === null`, `errors.length === 0`. */
function negatesError(expr: ts.Expression): boolean {
  const e = skipParens(expr) as ts.Expression;
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) return testsError(e.operand);
  if (ts.isBinaryExpression(e) && EQUALS.includes(e.operatorToken.kind)) {
    const empty = [e.left, e.right].find((side) => isEmptyValue(side) || isZero(side));
    return empty !== undefined && testsError(empty === e.left ? e.right : e.left);
  }
  return false;
}
/** The condition the element is drawn under names an error, and it is drawn when that holds: `{saveError && <p>…</p>}`, `if (!error) … else`. */
const namesError = (c: Condition): boolean => c.error ?? (c.test !== undefined && (c.whenTrue ? testsError(c.test) : negatesError(c.test)));

const isOverlay = (el: Jsx, known: KnownComponents): boolean => {
  const name = tagName(el);
  return known.overlays.has(name) || (isDotted(el) && OVERLAY_PARTS.has(name));
};
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
const nearestElement = (node: ts.Node): Jsx | undefined => {
  for (let up = node.parent; up && !ts.isSourceFile(up); up = up.parent) if (isJsx(up)) return up;
  return undefined;
};

/** The element holds something besides the child `inner` is in: text or another element. */
const holdsMore = (el: Jsx, inner: ts.Node): boolean =>
  !ts.isJsxSelfClosingElement(el) && el.children.some((c) => !isWithin(inner, c) && !(ts.isJsxText(c) && c.text.trim() === ''));
/** Every return of the function that returns this view is an element with a fixed `min-h-`, none of them nothing. */
function viewsAreAllSlots(view: Jsx): boolean {
  let fn: ts.Node | undefined = view.parent;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  if (!fn || (ts.isArrowFunction(fn) && !ts.isBlock(fn.body))) return false;
  const views: ts.Node[] = [];
  const visit = (n: ts.Node) => {
    if (n !== fn && ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n)) views.push(n.expression ? skipParens(n.expression) : n);
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return views.every((v) => isJsx(v) && isFixedSlot(v));
}

/**
 * The element is in a slot that keeps its height in every state: itself, or an ancestor in the same component, reached through wrappers up to
 * the nearest element that holds anything else, carries a fixed `min-h-`, and that slot is always drawn. A slot drawn only in some states
 * reserves nothing: `{e && <div className="min-h-[2lh]">…</div>}` comes and goes with its height, unless every view the component returns is
 * such a slot (`WorkerPlanNote`: its error, loading and plan views are each three lines tall).
 */
function inReservedSlot(node: Jsx): boolean {
  if (isFixedSlot(node)) return !isConditional(node) || viewsAreAllSlots(node);
  let inner: ts.Node = node;
  for (let up = node.parent; up && !ts.isSourceFile(up); up = up.parent) {
    if (ts.isFunctionLike(up)) return false;
    if (!isJsx(up)) continue;
    if (isFixedSlot(up)) return !isConditional(up);
    if (holdsMore(up, inner)) return false;
    inner = up;
  }
  return false;
}

/**
 * The first element in this subtree (itself included) that marks an error. It does not descend into JSX drawn under a condition of its own
 * (counted on its own), an overlay or screen-reader-only text. In a view a component returns in some states it does not descend into a swap
 * branch or a fixed slot either: the view is drawn in place of the component's others, and the swap and the slot are in place within it. A
 * slot inside an element drawn under `&&` or `?:` comes and goes with it, so there it hides nothing.
 */
function firstSignal(root: Jsx, inView: boolean, known: KnownComponents): { why: string; at: Jsx } | undefined {
  let found: { why: string; at: Jsx } | undefined;
  const visit = (node: ts.Node, inCell: boolean) => {
    if (found) return;
    let cell = inCell;
    if (isJsx(node)) {
      if (node !== root && (isConditional(node) || (inView && (isSwapBranch(node) || isFixedSlot(node))))) return;
      if (isOverlay(node, known) || isScreenReaderOnly(node)) return;
      cell ||= isCell(node);
      const why = signal(node, cell, known);
      if (why) {
        found = { why, at: node };
        return;
      }
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

/**
 * Why an element counts. `view`: it is a view of content a component returns in some states, counted once for `at`, the element in it that
 * marks an error; what it draws in some states is counted on its own.
 */
type Found = { why: string; at?: Jsx; view?: boolean };
/** Why this element, outside any overlay or reserved slot, counts as an error in a page's flow. */
function inFlowError(node: Jsx, known: KnownComponents): Found | undefined {
  const c = condition(node);
  if (!c) return alwaysDrawnError(node, known);
  if (drawsWholePage(node) || isBadge(node)) return undefined;
  const found = firstSignal(node, c.view === true, known);
  // A view that is itself the error (its condition names one, or the view's own element is marked) is counted once, as any other. In a view of
  // content, an element that counts when always drawn counts as itself.
  const contentView = c.view === true && !namesError(c) && found?.at !== node;
  if (found && contentView && alwaysDrawnError(found.at, known)) return undefined;
  if (found) return { why: `drawn in some states, ${found.why}`, at: found.at, view: contentView };
  if (namesError(c) && !isControlsOnly(node)) return { why: `drawn in some states, under ${(c.test?.getText() ?? 'an error case').slice(0, 60)}` };
  return undefined;
}

/** Why an element counts though it is always drawn: its error line comes and goes inside it. */
function alwaysDrawnError(node: Jsx, known: KnownComponents): Found | undefined {
  const alert = alertMark(node);
  if (alert) return { why: alert };
  // A button's words are its label: a word that comes and goes in it is not a line of the page.
  if (showsErrorText(node) && !BUTTONS.has(tagName(node))) return { why: 'error-named text, empty until the error comes' };
  if (isFieldError(node)) return { why: 'Field error, its line drawn only when set' };
  if (EMPTY_HIDDEN.test(classText(node)) && !ts.isJsxSelfClosingElement(node) && signal(node, under(node, isCell), known))
    return { why: 'empty:hidden error line, gone while it is empty' };
  return undefined;
}

/** `{saveError && renderError(saveError)}`: a call that draws something only when an error is set, its markup out of sight. */
function errorCall(expr: ts.JsxExpression): string | undefined {
  const e = expr.expression && skipParens(expr.expression);
  if (!e) return undefined;
  const isCall = (x: ts.Node) => {
    const n = skipParens(x);
    return ts.isCallExpression(n) && !n.arguments.some((a) => ts.isFunctionLike(skipParens(a)));
  };
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && isCall(e.right) && testsError(e.left))
    return `drawn in some states, under ${e.left.getText().slice(0, 60)}, by a call`;
  if (ts.isConditionalExpression(e) && isCall(e.whenTrue) && isEmptyValue(e.whenFalse) && testsError(e.condition))
    return `drawn in some states, under ${e.condition.getText().slice(0, 60)}, by a call`;
  return undefined;
}

type Component = { body: ts.Node; exported: boolean };
/** The components the file declares at its top level (a function, an arrow, or one wrapped in `memo`), by name. */
function components(sf: ts.SourceFile): Map<string, Component> {
  const found = new Map<string, Component>();
  const exportedNames = new Set<string>();
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) exportedNames.add(st.expression.text);
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause))
      for (const el of st.exportClause.elements) exportedNames.add((el.propertyName ?? el.name).text);
  }
  for (const st of sf.statements) {
    const exported = (ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) === true;
    if (ts.isFunctionDeclaration(st) && st.name && /^[A-Z]/.test(st.name.text))
      found.set(st.name.text, { body: st, exported: exported || exportedNames.has(st.name.text) });
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !/^[A-Z]/.test(d.name.text) || !d.initializer) continue;
      const init = skipParens(d.initializer);
      const fn = ts.isCallExpression(init) ? init.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a)) : init;
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)))
        found.set(d.name.text, { body: fn, exported: exported || exportedNames.has(d.name.text) });
    }
  }
  return found;
}

/** The elements a component returns (through `&&`, `?:` and parentheses), or undefined when a return is something else. */
function returnedElements(body: ts.Node): Jsx[] | undefined {
  const drawn = (expr: ts.Node): Jsx[] | undefined => {
    const n = skipParens(expr);
    if (isEmptyValue(n)) return [];
    if (isJsx(n)) return [n];
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return drawn(n.right);
    if (ts.isConditionalExpression(n)) {
      const [a, b] = [drawn(n.whenTrue), drawn(n.whenFalse)];
      return a && b ? [...a, ...b] : undefined;
    }
    return undefined;
  };
  if (ts.isArrowFunction(body) && !ts.isBlock(body.body)) return drawn(body.body);
  const all: Jsx[] = [];
  let other = false;
  const visit = (n: ts.Node) => {
    if (n !== body && ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) {
      const els = drawn(n.expression);
      if (els) all.push(...els);
      else other = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return other ? undefined : all;
}

/**
 * `overlay.open({ kind: 'dialog', render })` (or the service passed in, as `openCheckRecordings` takes it): what it renders is drawn in the
 * overlay service's layer. A `kind: 'slideOver'` is not: a slide-over's body is in scope.
 */
const isOverlayOpen = (node: ts.Node): boolean => {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'open') return false;
  const spec = node.arguments[0];
  if (!spec || !ts.isObjectLiteralExpression(spec)) return false;
  const prop = (name: string) => spec.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === name);
  const kind = literalText(prop('kind')?.initializer ?? spec);
  if (!prop('render') || kind === undefined) return false;
  return kind !== 'slideOver';
};

/** The node is drawn inside an overlay element (in its children, or anywhere in a dialog's props: a popover's trigger is in the page), or in what `overlay.open` renders. */
function inOverlayElement(node: ts.Node, known: KnownComponents): boolean {
  let viaAttribute = false;
  for (let up = node.parent; up && !ts.isSourceFile(up); up = up.parent) {
    if (ts.isJsxAttribute(up)) viaAttribute = true;
    else if (isJsx(up)) {
      if (isOverlay(up, known) && !(viaAttribute && NOT_MODAL.has(tagName(up)))) return true;
      viaAttribute = false;
    } else if (isOverlayOpen(up)) return true;
  }
  return false;
}

/**
 * What the exported components of these files draw, read by name so a call site in another file knows them. An overlay: every return is a
 * dialog or the navigation drawer, not a slide-over (in scope), a popover, a menu or a tooltip (whose trigger is drawn in the page) (`ConnectionResolveDialog` returns a
 * `ReaperOffDialog` or a `ChapterLinkDialog`, each a `ResolveShell` that returns a `Dialog`). A notice: every returned element carries an error
 * mark (`role="alert"`, a danger or warn colour or tone); one that returns an error in some states and its content in others is not, as its own
 * file counts that view. Drawn only in an overlay: every use is inside an overlay element, in what `overlay.open` renders, or in the body of a
 * component drawn only there (`CheckResult`, a step of `CheckRecordingsDialog`, which `openCheckRecordings` opens). Each is repeated until
 * nothing new is learnt. Two exported components with one name are taken as one.
 */
export function knownComponents(files: { file: string; text: string }[]): KnownComponents {
  const known = { overlays: new Set(OVERLAY_TAGS), notices: new Set(NOTICE_COMPONENTS), drawnInOverlay: new Set<string>() };
  const parsed = files.map(({ file, text }) => {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    return { sf, comps: components(sf) };
  });
  const exported = parsed.flatMap(({ comps }) => [...comps].filter(([, c]) => c.exported).map(([name, c]) => ({ name, roots: returnedElements(c.body) })));
  const learn = (kind: Set<string>, is: (roots: Jsx[]) => boolean) => {
    for (let grew = true; grew;) {
      grew = false;
      for (const { name, roots } of exported) {
        if (!roots?.length || kind.has(name) || known.overlays.has(name) || known.notices.has(name) || BADGES.has(name) || !is(roots)) continue;
        kind.add(name);
        grew = true;
      }
    }
  };
  const modals = new Set(MODAL_TAGS);
  learn(modals, (roots) => roots.every((r) => modals.has(tagName(r))));
  for (const name of modals) known.overlays.add(name);
  learn(known.notices, (roots) => roots.every((r) => errorMark(r, false) !== undefined || known.notices.has(tagName(r))));

  const names = new Set(exported.map(({ name }) => name));
  const uses = new Map<string, { node: Jsx; at: (typeof parsed)[number] }[]>();
  for (const at of parsed) {
    const collect = (node: ts.Node) => {
      if (isJsx(node) && names.has(tagName(node))) uses.set(tagName(node), [...(uses.get(tagName(node)) ?? []), { node, at }]);
      ts.forEachChild(node, collect);
    };
    collect(at.sf);
  }
  for (let grew = true; grew;) {
    grew = false;
    const bodies = new Map(parsed.map((at) => [at, overlayOnlyComponents(at.sf, known, at.comps)]));
    for (const name of names) {
      const at = uses.get(name) ?? [];
      if (known.drawnInOverlay.has(name) || known.overlays.has(name) || at.length === 0) continue;
      if (at.every((use) => inOverlayElement(use.node, known) || [...(bodies.get(use.at) ?? [])].some((body) => isWithin(use.node, body)))) {
        known.drawnInOverlay.add(name);
        grew = true;
      }
    }
  }
  return known;
}

/**
 * The bodies of the file's components that draw only in an overlay: one every return of which is a dialog or the navigation drawer (what it
 * builds in a variable goes in there too), an exported one that every file draws only in an overlay, and one of the file's own (not exported)
 * that it draws only inside an overlay element or inside another such component: `function Row()` drawn in the `<Dialog>` of the same file.
 */
function overlayOnlyComponents(sf: ts.SourceFile, known: KnownComponents, all = components(sf)): Set<ts.Node> {
  const local = new Map([...all].filter(([, c]) => !c.exported).map(([name, c]) => [name, c.body]));
  const uses = new Map<string, Jsx[]>();
  const collect = (node: ts.Node) => {
    if (isJsx(node) && local.has(tagName(node))) uses.set(tagName(node), [...(uses.get(tagName(node)) ?? []), node]);
    ts.forEachChild(node, collect);
  };
  collect(sf);
  const isModal = (el: Jsx) => known.overlays.has(tagName(el)) && !NOT_MODAL.has(tagName(el));
  const bodies = new Set(
    [...all].filter(([name, c]) => (c.exported && known.drawnInOverlay.has(name)) || returnedElements(c.body)?.every(isModal)).map(([, c]) => c.body),
  );
  const inBody = (node: ts.Node) => [...bodies].some((body) => isWithin(node, body));
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, body] of local) {
      if (bodies.has(body)) continue;
      const at = uses.get(name) ?? [];
      if (at.length > 0 && at.every((use) => inOverlayElement(use, known) || inBody(use))) {
        bodies.add(body);
        grew = true;
      }
    }
  }
  return bodies;
}

/**
 * The errors one source file draws in a page's flow. An element counts when it is drawn only in some states and it, or an element in it,
 * marks an error (`role="alert"` or `aria-live="assertive"`, a danger or warn text colour, a danger or warn tone on a block, `Note alert`,
 * `Field error`, a notice component, a failure sentence, or an error's text), or when the condition it is drawn under names an error.
 * Also counted when always drawn: an element showing an error's text (empty until the error comes), `Field error` (Field draws the line only
 * when set), `role="alert"`, an `empty:hidden` status or error line, and a call drawn only while an error is set. Not counted: anything inside
 * an overlay element, an overlay component or a component of the file drawn only there, screen-reader-only text, and an element in an
 * always-drawn slot with a fixed `min-h-`. An element inside a counted one is not counted again, except in a view a component returns in some
 * states: the view counts once for what it always shows, and what it draws in some states counts on its own.
 */
export function scanSource(file: string, text: string, known: KnownComponents = BUILT_IN): InlineErrorFinding[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: InlineErrorFinding[] = [];
  const marksAView = new Set<ts.Node>();
  const inOverlay = overlayOnlyComponents(sf, known);
  const add = (node: ts.Node, why: string) => findings.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, why });
  const visit = (node: ts.Node) => {
    if (inOverlay.has(node)) return;
    if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const holder = nearestElement(node);
      const why = holder && inReservedSlot(holder) ? undefined : errorCall(node);
      if (why) add(node, why);
    }
    if (isJsx(node)) {
      if (isOverlay(node, known) || isScreenReaderOnly(node)) return;
      // The element that marks a counted view, and what is always drawn in it, are that view's finding.
      const inMark = marksAView.has(node) || (under(node, (el) => marksAView.has(el)) && !isConditional(node));
      const found = inMark || inReservedSlot(node) ? undefined : inFlowError(node, known);
      if (found) {
        add(node, found.why);
        if (!found.view) return;
        if (found.at) marksAView.add(found.at);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

const allSources = (): { file: string; text: string }[] =>
  sources(SRC).map((path) => ({ file: relative(SRC, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }));

/** Every error drawn in a page's flow, by path from src/, outside DRAWN_IN_OVERLAY unless `withDrawnInOverlay` (to check each entry hides one). */
export function inlineErrorFindings({ withDrawnInOverlay = false } = {}): InlineErrorFinding[] {
  const files = allSources();
  const known = knownComponents(files);
  return files.flatMap(({ file, text }) => (!withDrawnInOverlay && file in DRAWN_IN_OVERLAY ? [] : scanSource(file, text, known)));
}

/** Whether a path from src/ names a file. */
export const sourceExists = (file: string): boolean => {
  try {
    return statSync(join(SRC, file)).isFile();
  } catch {
    return false;
  }
};
