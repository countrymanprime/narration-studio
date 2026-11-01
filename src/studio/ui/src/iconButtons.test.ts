// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

// #2251 item 19: "Use icon buttons where it matters (for example Look up in the Script context menu and parts of Editing). Audit; add a guard."
// Two rules over the JSX in src/components, so a new control cannot quietly break either:
//
// 1. A toolbar holds icon buttons. Inside an element with `role="toolbar"` or a `Toolbar` primitive, a `Button` drawn with words (text or an
//    expression for children) fails, unless `TOOLBAR_WORDS` lists it with the reason it needs words. Use `IconButton` with a catalogue
//    action (icons.catalog.ts), which brings the icon, the accessible name and the tooltip.
// 2. An icon-only button has a name. A `button` or `Button` whose only children are icons (`Icon`, `FontAwesomeIcon`, `svg`) fails without
//    `aria-label` or `aria-labelledby`: a screen reader would say "button". (`IconButton` cannot be written without `label` or `action`; its
//    types require one.) A button with spread props is not judged, since the name may be in them.
//
// The visual suite's axe run (`button-name`) checks the same at run time on the states it captures; this one sees every file, captured or not.

const uiRoot = join(__dirname, '..');
const componentsRoot = join(uiRoot, 'src', 'components');

// A text `Button` inside a toolbar, by file and its words, with why words are right there.
const TOOLBAR_WORDS: Record<string, string> = {
  // Across paragraphs the selection tools are one disabled button that says why; it is a sentence, not an action.
  'src/components/script/page/tools/select/SelectionTool.tsx:{ACROSS_PARAGRAPHS}':
    'the only button across paragraphs is a disabled one that says why the tools are off, a sentence no icon can say',
  // The companion is a roomy panel beside the DAW that the narrator reads at a glance while recording; its transport names each action
  // (and shows its key) rather than packing dense icons the mock does not draw there.
  'src/components/booth/CompanionShell.tsx:Follow': 'the companion transport names its actions for a glance while recording',
};

const ICON_TAGS = new Set(['Icon', 'FontAwesomeIcon', 'svg']);
const SOURCE = /\.tsx$/;
const NOT_UNDER_TEST = /\.(test|stories)\.tsx$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry.name) && !NOT_UNDER_TEST.test(entry.name) ? [path] : [];
  });
}

type Element = ts.JsxElement | ts.JsxSelfClosingElement;
const opening = (node: Element) => (ts.isJsxElement(node) ? node.openingElement : node);
const tagOf = (node: Element) => opening(node).tagName.getText();
const attributes = (node: Element) => opening(node).attributes.properties;
const hasAttribute = (node: Element, name: string) => attributes(node).some((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
const hasSpread = (node: Element) => attributes(node).some((a) => ts.isJsxSpreadAttribute(a));
const attributeText = (node: Element, name: string) => {
  const found = attributes(node).find((a) => ts.isJsxAttribute(a) && a.name.getText() === name) as ts.JsxAttribute | undefined;
  return found?.initializer && ts.isStringLiteral(found.initializer) ? found.initializer.text : undefined;
};

/** The children that draw something: whitespace-only text is layout, not content. */
function children(node: Element): ts.JsxChild[] {
  if (!ts.isJsxElement(node)) return [];
  return node.children.filter((child) => !(ts.isJsxText(child) && child.text.trim() === '') && !(ts.isJsxExpression(child) && !child.expression));
}

const isIcon = (child: ts.JsxChild) => (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) && ICON_TAGS.has(tagOf(child));
/** What a button says in words: its text and expression children, as written, or nothing when it is icons only. */
const wordsOf = (node: Element) =>
  children(node)
    .filter((child) => ts.isJsxText(child) || ts.isJsxExpression(child))
    .map((child) => child.getText().replace(/\s+/g, ' ').trim())
    .join(' ');

export type Finding = { file: string; line: number; rule: 'toolbar-words' | 'icon-without-name'; words?: string };

/** Both rules over one file's source. */
export function scanIconButtons(source: string, file = 'probe.tsx'): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Finding[] = [];
  const line = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const visit = (node: ts.Node, inToolbar: boolean) => {
    let toolbar = inToolbar;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagOf(node);
      if (tag === 'Toolbar' || attributeText(node, 'role') === 'toolbar') toolbar = true;
      if (tag === 'Button' && toolbar && wordsOf(node)) found.push({ file, line: line(node), rule: 'toolbar-words', words: wordsOf(node) });
      if ((tag === 'button' || tag === 'Button') && !hasSpread(node)) {
        const drawn = children(node);
        const named = hasAttribute(node, 'aria-label') || hasAttribute(node, 'aria-labelledby');
        if (drawn.length > 0 && drawn.every(isIcon) && !named) found.push({ file, line: line(node), rule: 'icon-without-name' });
      }
    }
    ts.forEachChild(node, (child) => visit(child, toolbar));
  };
  visit(sf, false);
  return found;
}

const posix = (path: string) => relative(uiRoot, path).split(sep).join('/');

describe('icon buttons (#2251 item 19)', () => {
  const findings = sourceFiles(componentsRoot).flatMap((path) => scanIconButtons(readFileSync(path, 'utf8'), posix(path)));

  test('toolbar-holds-icon-buttons: a text Button inside a toolbar is listed with its reason', () => {
    const unlisted = findings
      .filter((f) => f.rule === 'toolbar-words' && !TOOLBAR_WORDS[`${f.file}:${f.words}`])
      .map((f) => `${f.file}:${f.line} "${f.words}": use IconButton with a catalogue action, or list it in TOOLBAR_WORDS with why it needs words`);
    expect(unlisted).toEqual([]);
  });

  test('every TOOLBAR_WORDS entry still matches a button (delete a stale entry)', () => {
    const seen = new Set(findings.filter((f) => f.rule === 'toolbar-words').map((f) => `${f.file}:${f.words}`));
    expect(Object.keys(TOOLBAR_WORDS).filter((key) => !seen.has(key))).toEqual([]);
  });

  test('icon-only-buttons-have-a-name', () => {
    expect(findings.filter((f) => f.rule === 'icon-without-name').map((f) => `${f.file}:${f.line}`)).toEqual([]);
  });
});

describe('scanIconButtons', () => {
  test('flags a text Button in a role="toolbar" element and in a Toolbar, not outside one', () => {
    const source = `
      const a = <div role="toolbar"><span><Button>Look up</Button></span></div>;
      const b = <Toolbar label="x"><Button variant="ghost">{label}</Button></Toolbar>;
      const c = <div><Button>Save</Button></div>;
      const d = <div role="toolbar"><IconButton action="lookUp" /></div>;`;
    expect(scanIconButtons(source).map((f) => [f.rule, f.words])).toEqual([
      ['toolbar-words', 'Look up'],
      ['toolbar-words', '{label}'],
    ]);
  });

  test('flags an icon-only button with no name, and passes one with aria-label, aria-labelledby, spread props or words', () => {
    const source = `
      const a = <button type="button"><FontAwesomeIcon icon={faX} /></button>;
      const b = <Button><Icon name="play" /></Button>;
      const c = <button aria-label="Close"><Icon name="close" /></button>;
      const d = <button aria-labelledby="t"><svg /></button>;
      const e = <button {...props}><Icon name="close" /></button>;
      const f = <Button><Icon name="play" /> Play</Button>;`;
    expect(scanIconButtons(source).map((f) => [f.rule, f.line])).toEqual([
      ['icon-without-name', 2],
      ['icon-without-name', 3],
    ]);
  });
});
