// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

// docs/architecture/studio-shell-and-registries.md: a command is registered with `useCommand`, never heard with a
// feature's own `keydown` listener - the rule that made three listeners quietly disagree on modifiers, dialogs and
// fields in the first place. This scan (in the style of rawNatives.test.ts) fails on `<target>.addEventListener('keydown', ...)`
// outside `src/input/`, unless the file is in ALLOWLIST below, and each entry there must say why. A file dropped from
// the allowlist here has its keydown listener removed elsewhere in the same change, so the entry is deleted too.
type Reason = { readonly note: string };

// Permanent: not a command, so never migrated onto the registry.
const PERMANENT: Record<string, Reason> = {
  'src/components/primitives/inputModality.ts': { note: 'tracks the last input modality (keyboard vs pointer), not a command' },
  'src/components/primitives/Tooltip.tsx': { note: 'Escape closes the tooltip (WCAG 1.4.13), a widget key owned by the primitive, not a command' },
  'src/components/script/page/tools/select/SelectionTool.tsx': {
    note: 'Escape dismisses the selection toolbar while focus stays in the reader, a widget key owned by the toolbar, not a command',
  },
  'src/components/booth/side/BoothSidePanel.tsx': { note: 'Escape closes the side panel when it is a drawer, a widget key owned by the panel, not a command' },
  'src/components/recordingcheck/CheckRecordingsDialog.tsx': {
    note: 'Escape while a check runs asks to stop it, a widget key owned by the dialog, not a command',
  },
  'src/components/voicesamples/samplePlayerStore.ts': {
    note: "Escape stops the voice sample that is playing, on whatever page plays it and only while one does, a key owned by that transient playback state like the tooltip's; a catalogue row would share Escape with every page's own Escape row and be shadowed by each of them",
  },
  'src/App.tsx': {
    note: "swallows an Enter or Space echoed onto the unsaved question's way to stay, in the capture phase, and notes the press that may have asked it (#3446): a guard on one dialog's button, not a command",
  },
  'src/components/primitives/dialogClosed.ts': {
    note: 'stops an Escape auto-repeat so a held Escape closes one layer, not the one under it too (#3549), and the repeats of an Enter or Space that answered a dialog, so they do not press the control focus returns to (#3555): guards on the layers, not commands',
  },
  'src/components/primitives/Toast.tsx': {
    note: "installs the held-key listeners of HeldKeys (`attach`, src/input/heldKeys.ts) and, with them, the grace after a keyboard Dismiss: for a moment after a toast press, a fresh Enter or Space is consumed (`preventDefault`, `stopPropagation`, held, so its repeats are cancelled until its keyup), so it presses neither the control focus went back to nor the page's own command (#4063, #4125). It cannot be a useCommand row: a command row is a key bound to an action, and this is a rule on every Enter or Space for a short window after a press, in the capture phase, before any command or field sees it; it belongs to the toast region, which removes it when the keys come up or the region goes",
  },
  'src/components/booth/useFollowCursor.ts': { note: 'isScrollKey detects a hand scroll, not a command' },
  'src/components/primitives/Menu.test.tsx': {
    note: "a test stands in for the router: it listens on the document to prove that a Ctrl+Alt+Space chord pressed on a menu item still reaches the page once (#4195); the router's own listener is in src/input/",
  },
  'src/components/primitives/Toolbar.test.tsx': {
    note: "a test stands in for the router: it listens on the document to prove that a Ctrl+Alt+Space chord pressed on a toolbar button still reaches the page once (#4195); the router's own listener is in src/input/",
  },
};

// Temporary: a command listener not yet migrated onto `useCommand`. Each entry names what migrates it and is
// deleted in the pull request that migrates it. SN-C4 (#1217) left one, Proof's Ctrl+F, which #2251 item 23 removed.
const TEMPORARY: Record<string, Reason> = {};

const ALLOWLIST: Record<string, Reason> = { ...PERMANENT, ...TEMPORARY };

const uiRoot = join(__dirname, '..');
const srcRoot = join(uiRoot, 'src');
const inputDir = join('src', 'input');
const SOURCE = /\.(ts|tsx)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry.name) ? [path] : [];
  });
}

// Reads with the TypeScript parser (like rawNatives.test.ts), so a comment or a string mentioning "keydown" is not a
// hit, and only `<expr>.addEventListener('keydown', ...)` counts, whatever the target expression is (`document`,
// `window`, an injected target, ...).
function keydownListenerCount(source: string, fileName: string): number {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'addEventListener' &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      node.arguments[0].text === 'keydown'
    ) {
      count++;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

// `HeldKeys.attach` (src/input/heldKeys.ts) installs its caller's function as a keydown listener in the capture phase, from inside src/input/, which this scan skips: so a call to `attach` in a file that imports
// `HeldKeys` counts as a keydown listener too, and the file needs the same reasoned entry. Read with the parser like the scan above; a file that never imports the class has no call to count.
function heldKeysAttachCount(source: string, fileName: string): number {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imported = file.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      /(^|\/)heldKeys$/.test(statement.moduleSpecifier.text) &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some((element) => (element.propertyName ?? element.name).text === 'HeldKeys'),
  );
  if (!imported) return 0;
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'attach') count++;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

const listenerCount = (source: string, fileName: string): number => keydownListenerCount(source, fileName) + heldKeysAttachCount(source, fileName);

/** The files that listen for keys without an entry in `allowlist`, and the entries whose file no longer does. */
function judge(counts: ReadonlyMap<string, number>, allowlist: Record<string, Reason>): { offenders: string[]; stale: string[] } {
  return {
    offenders: [...counts.keys()].filter((file) => (counts.get(file) ?? 0) > 0 && !(file in allowlist)),
    stale: Object.keys(allowlist).filter((file) => (counts.get(file) ?? 0) === 0),
  };
}

describe('command listeners stay inside src/input/', () => {
  const files = sourceFiles(srcRoot)
    .map((file) => relative(uiRoot, file))
    .filter((file) => !file.startsWith(inputDir + sep))
    .map((file) => file.split(sep).join('/'));
  const counts = new Map(files.map((file) => [file, listenerCount(readFileSync(join(uiRoot, file), 'utf8'), file)]));

  test('no file outside the allowlist adds a keydown listener', () => {
    expect(
      judge(counts, ALLOWLIST).offenders,
      'register a command with useCommand (src/input/useCommand.ts) instead of listening for keydown yourself (HeldKeys.attach is a keydown listener too); ' +
        'if this really is not a command, add a reasoned entry to listenerGuard.test.ts',
    ).toEqual([]);
  });

  test('every allowlist entry still has a keydown listener (delete a stale entry)', () => {
    expect(judge(counts, ALLOWLIST).stale, 'this file no longer adds a keydown listener - delete its listenerGuard.test.ts entry').toEqual([]);
  });

  test('the scan sees the call however it is written (a bad fixture per form)', () => {
    expect(keydownListenerCount("document.addEventListener('keydown', onKeyDown);", 'probe.ts')).toBe(1);
    expect(keydownListenerCount('window.addEventListener("keydown", onKeyDown, true);', 'probe.ts')).toBe(1);
    expect(keydownListenerCount("target.current!.addEventListener('keydown', onKeyDown);", 'probe.ts')).toBe(1);
  });

  test('the scan ignores a comment or a string that only mentions keydown, and a different event', () => {
    expect(keydownListenerCount('// document.addEventListener(\'keydown\', x)\nconst a = "keydown";', 'probe.ts')).toBe(0);
    expect(keydownListenerCount("document.addEventListener('keyup', onKeyUp);", 'probe.ts')).toBe(0);
  });

  test('a call to HeldKeys.attach counts as a keydown listener, however the class is imported', () => {
    const attach = "new HeldKeys({ onBlur: 'keep', onUp }).attach(onKeyDown, onLost);";
    expect(heldKeysAttachCount(`import { HeldKeys } from '../../input/heldKeys';\n${attach}`, 'probe.ts')).toBe(1);
    expect(heldKeysAttachCount("import { activates, HeldKeys as Keys } from '../input/heldKeys';\nkeys.attach(a, b);", 'probe.ts')).toBe(1);
    expect(heldKeysAttachCount("import { HeldKeys } from './heldKeys';\nthis.keys.attach(a, b);\nother.attach(c, d);", 'probe.ts')).toBe(2);
  });

  test('a file that does not import HeldKeys, or only its helpers, has no attach to count', () => {
    expect(heldKeysAttachCount('observer.attach(a, b);', 'probe.ts')).toBe(0);
    expect(heldKeysAttachCount("import { keyOf } from '../../input/heldKeys';\nobserver.attach(a, b);", 'probe.ts')).toBe(0);
    expect(heldKeysAttachCount("import { HeldKeys } from './elsewhere';\nkeys.attach(a, b);", 'probe.ts')).toBe(0);
  });

  test('an attach call outside src/input without an entry is an offender, and an entry without a listener is stale', () => {
    const source = "import { HeldKeys } from '../input/heldKeys';\nnew HeldKeys({ onBlur: 'keep', onUp }).attach(onKeyDown, onLost);";
    const counts = new Map([
      ['src/components/feature/Feature.tsx', listenerCount(source, 'Feature.tsx')],
      ['src/components/feature/Quiet.tsx', listenerCount('export const a = 1;', 'Quiet.tsx')],
    ]);
    const allowlist = { 'src/components/feature/Quiet.tsx': { note: 'a reason' } };
    expect(judge(counts, allowlist)).toEqual({ offenders: ['src/components/feature/Feature.tsx'], stale: ['src/components/feature/Quiet.tsx'] });
    expect(judge(counts, { ...allowlist, 'src/components/feature/Feature.tsx': { note: 'a reason' } }).offenders).toEqual([]);
  });
});
