// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

// Two classes of accessibility-state gap a narrator walkthrough found on /editing, guarded over every source file rather than the two buttons:
//
// 1. A button that opens or closes something must say which it is now (`aria-expanded` for a region, panel or drawer it controls, `aria-pressed`
//    for a plain on/off, `aria-haspopup` for a menu or dialog it opens, whose popup supplies `aria-expanded`). The Timeline toggle and the
//    navigation opener had neither, so a screen reader could not tell whether the thing was open.
// 2. A `Button` or `IconButton` that is `aria-disabled` is drawn dimmed by the primitive. A call site that dims it itself is the old
//    per-instance fix: the primitive owns the look (`ariaDisabledLook.test.tsx`), so the copy goes.

const SRC = join(__dirname);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/.test(entry.name) && !/\.(test|stories)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

type Tag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function attributeText(tag: Tag, name: string, file: ts.SourceFile): string | undefined {
  for (const attribute of tag.attributes.properties) {
    if (ts.isJsxAttribute(attribute) && attribute.name.getText(file) === name) return attribute.initializer ? attribute.initializer.getText(file) : 'true';
  }
  return undefined;
}

function buttons(source: string, fileName: string): { line: number; tag: Tag; file: ts.SourceFile }[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { line: number; tag: Tag; file: ts.SourceFile }[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ['Button', 'IconButton'].includes(node.tagName.getText(file))) {
      found.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, tag: node, file });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

// A control whose name says it reveals or hides something, or whose press flips a boolean.
const TOGGLE_NAME = /^["'`{]*(open|show|hide|expand|collapse|toggle)\b/i;
// Catalogue actions that reveal or hide a panel (their tooltips: "Show the results", "Toggle the side panel", ...).
const TOGGLE_ACTIONS = new Set(['sidePanel', 'chapters', 'list', 'levels', 'showExample', 'hideExample', 'openMenu']);
// A press that flips a boolean (`setOpen((v) => !v)`, `setShown(!shown)`). A verb button that starts or stops a run (Record / Stop, Play / Pause,
// Turn on / Turn off) changes its label instead and is not a disclosure.
const FLIPS = /(=>\s*!|\(\s*!\w)/;
const STATE = ['aria-expanded', 'aria-pressed', 'aria-haspopup'];

// Names that start with a toggle word but go somewhere or do something once. Each carries the reason.
const NOT_A_TOGGLE: Record<string, string> = {
  'Hide the other': 'Hides other takes in the DAW and is done; it does not reveal them again from the same button.',
  'Show in': 'Moves the DAW cursor to the item; a one-shot navigation.',
  'Open in': 'A one-shot navigation to another app or page.',
  'Open this chapter in': 'A one-shot navigation to another page.',
  'Open ${': 'A one-shot navigation to a named item ("Open <name> in the manuscript reader").',
};

describe('a button that opens or closes something exposes its state', () => {
  test('every such Button / IconButton carries aria-expanded, aria-pressed or aria-haspopup', () => {
    const missing: string[] = [];
    for (const path of sources(SRC)) {
      const rel = relative(SRC, path).split(sep).join('/');
      if (rel.startsWith('components/primitives/')) continue;
      for (const { line, tag, file } of buttons(readFileSync(path, 'utf8'), rel)) {
        const label = attributeText(tag, 'label', file) ?? '';
        const action = attributeText(tag, 'action', file)?.replace(/["']/g, '') ?? '';
        const onClick = attributeText(tag, 'onClick', file) ?? '';
        const named = TOGGLE_NAME.test(label) && !Object.keys(NOT_A_TOGGLE).some((prefix) => label.replace(/^["'`{]*/, '').startsWith(prefix));
        if (!named && !TOGGLE_ACTIONS.has(action) && !FLIPS.test(onClick)) continue;
        // `pending` / `disabled` buttons that only flip a run state are not toggles; a label with no toggle word and no action is not either.
        if (STATE.some((name) => attributeText(tag, name, file) !== undefined)) continue;
        missing.push(`${rel}:${line} ${label || action || onClick.slice(0, 40)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('the scan sees a toggle with no state (a probe)', () => {
    const probe = `const a = <IconButton label="Open navigation" onClick={() => setOpen(true)} />; const b = <Button onClick={() => setOn((v) => !v)}>x</Button>;`;
    expect(buttons(probe, 'probe.tsx')).toHaveLength(2);
  });
});

describe('an aria-disabled Button does not dim itself', () => {
  test('no call site sets aria-disabled: opacity or cursor classes; the primitive owns them', () => {
    const copies: string[] = [];
    for (const path of sources(SRC)) {
      const rel = relative(SRC, path).split(sep).join('/');
      if (rel.startsWith('components/primitives/')) continue;
      for (const { line, tag, file } of buttons(readFileSync(path, 'utf8'), rel)) {
        const className = attributeText(tag, 'className', file) ?? '';
        if (/aria-disabled:(opacity|cursor)-/.test(className)) copies.push(`${rel}:${line}`);
      }
    }
    expect(copies).toEqual([]);
  });

  test('a raw <button> that is aria-disabled is dimmed too', () => {
    const bare: string[] = [];
    // `Button` is the primitive that draws it; `NavButton` keeps an off item at full strength and ends it with a lock (design-system.md, NavButton).
    const OWN_LOOK = new Set(['components/primitives/Button.tsx', 'components/primitives/NavButton.tsx']);
    for (const path of sources(SRC)) {
      const rel = relative(SRC, path).split(sep).join('/');
      if (OWN_LOOK.has(rel)) continue;
      const file = ts.createSourceFile(rel, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node): void => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === 'button') {
          const text = node.getText(file);
          if (text.includes('aria-disabled') && !/aria-disabled:opacity-/.test(text))
            bare.push(`${rel}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(bare).toEqual([]);
  });
});
