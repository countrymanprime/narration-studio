// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for #4113 (definition of done, rule 1): a name the narrator or an author chose (a chapter title, a track, a character, a profile, a file) that goes into the sentence of a toast is
// wrapped in `isolatedIfRtl` (`visibleText.ts`), or a right-to-left name at the start of the sentence turns the whole line around and the full stop or a count jumps to the wrong side.
//
// This test reads the source with a small lexer (comments, strings and nested templates are skipped, so a stray backtick in a comment blinds nothing). It reads only what it can prove, each
// `${expression}` of a template literal that is:
//  - an argument of a call that raises a toast: any `<object>.toast` / `?.toast` / `.toastUndo`, a bare `toast(`, `notify` and `say`; or
//  - in a statement that names `message` or `reason` (`let message = ...`, `{ reason: ... }`), which is how a command hands its words to the toast that shows them; or
//  - anywhere in the two toast-builder files (`chapterSyncToastText.ts`, `toastSentences.ts`).
// An expression that reads like a name (an identifier ending in name, title, label, path or quote) must be wrapped whole by `isolatedIfRtl` or `bidiIsolated`: a wrapper somewhere inside it
// (`ok ? isolatedIfRtl(a.title) : b.title`) does not count, nor one that wraps a joined list (each name is isolated before the join). A name the app itself defines (a setting's label, a
// product's name) is allowed with the reason in `APP_DEFINED`; an entry nothing reads any more fails.
//
// Not read, because the matcher is narrow on purpose (a wider one is #4129): a name held in a variable or an identifier that does not end in name, title, label, path or quote (`speaker`,
// `device`, `listening.device`, `chapter`, `short`, `who`, `term`, `text`), and a list built with `.map(…)` before `.join(…)`. Those wraps are held by their own unit tests instead
// (`deviceProblem.test.ts`, `quoteTerm.test.ts`, `movedOutSentence.test.ts`, `recheckSentence.test.ts`, `BoothNextPage.test.tsx`).
//
// NOT covered yet, tracked in #4129 (and #4126 for the host's own sentences): journal labels (the text of an Undo entry, which a toast can show bare: `Undid <label>`, `Undo '<label>' first`), leave-guard labels (the text of a save refusal or a save/discard verdict, built in
// `GuideDetail` and read in `App.tsx`),
// page and dialog text, file names and paths outside a toast, joined lists on pages, a sentence built in one place and interpolated in another, an alias of a toast function, a backtick in a
// regular expression literal, `overlay['toast'](`, `overlay.announce` (read out, never drawn), and `engine/destination.ts` (its unit tests, `destination.test.ts`).
const SRC = __dirname;
const NOT_READ = /^(?:api|fixtures|ports)\//;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories|guard\.test)\.tsx?$/.test(name)) yield path;
  }
}

type Template = { start: number; end: number; exprs: { text: string; start: number }[] };

/** The template literals of a source (nested ones too) and which characters are code (not a comment, a string or a template's own text). */
function lex(source: string): { templates: Template[]; isCode: boolean[] } {
  const templates: Template[] = [];
  const isCode: boolean[] = new Array<boolean>(source.length).fill(false);

  // Reads code from `i` to the end of the source, or (inside a `${`) to the brace that closes it; returns the index of that brace.
  const code = (from: number, inBraces: boolean): number => {
    let depth = 0;
    let i = from;
    while (i < source.length) {
      const ch = source[i]!;
      const next = source[i + 1];
      if (ch === '/' && next === '/') {
        while (i < source.length && source[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        const close = source.indexOf('*/', i + 2);
        i = close < 0 ? source.length : close + 2;
        continue;
      }
      if (ch === "'" || ch === '"') {
        i++;
        while (i < source.length && source[i] !== ch && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1;
        i++;
        continue;
      }
      if (ch === '`') {
        i = template(i);
        continue;
      }
      if (inBraces && ch === '}' && depth === 0) return i;
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      isCode[i] = true;
      i++;
    }
    return i;
  };

  // Reads the template literal that opens at `open`; returns the index after its closing backtick.
  const template = (open: number): number => {
    const found: Template = { start: open, end: open, exprs: [] };
    templates.push(found);
    let i = open + 1;
    while (i < source.length) {
      const ch = source[i]!;
      if (ch === '\\') i += 2;
      else if (ch === '`') {
        found.end = i;
        return i + 1;
      } else if (ch === '$' && source[i + 1] === '{') {
        const close = code(i + 2, true);
        found.exprs.push({ text: source.slice(i + 2, close), start: i + 2 });
        i = close + 1;
      } else i++;
    }
    found.end = i;
    return i;
  };

  code(0, false);
  return { templates, isCode };
}

const CALL = /(?:(?:\?\.|\.)(?:toast|toastUndo)|(?<![\w$.])(?:toast|toastUndo)|\bnotify|\bsay)\(/g;
const SENTENCE_STATEMENT = /\b(?:message|reason)\b/;
const NAMEISH = /\b\w*(?:[Nn]ame|[Tt]itle|[Ll]abel|[Pp]ath|[Qq]uote)\b/;
/** Whether an expression reads like a name; the words inside its quotes (`plural(n, 'track')`) are text, not names. */
const nameish = (expression: string): boolean => NAMEISH.test(expression.replace(/(['"])(?:\\.|(?!\1).)*\1/g, "''"));
const WRAPPERS = /^(?:isolatedIfRtl|bidiIsolated)\(/;

/** The index just past the parenthesis that closes the one at `open`, counting only code characters. */
function closeOf(source: string, isCode: boolean[], open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (!isCode[i]) continue;
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return i + 1;
  }
  return source.length;
}

/** True when the whole expression is one call of a wrapper: `isolatedIfRtl(…)`, and nothing before or after it. */
function wrappedWhole(expression: string): boolean {
  const text = expression.trim();
  const match = WRAPPERS.exec(text);
  if (!match) return false;
  const { isCode } = lex(text);
  if (closeOf(text, isCode, match[0].length - 1) !== text.length) return false;
  // A joined list isolated as one unit keeps the order of its names wrong: each name is isolated before the join.
  return !/\.join\(/.test(text.slice(match[0].length));
}

type Found = { hits: string[]; seen: string[]; inspected: number };

/** The name-like expressions that go into toast sentences in one source, and which of them are not wrapped. A key is `<file>: <expression>`. */
export function scanSource(file: string, source: string): Found {
  const { templates, isCode } = lex(source);
  const found: Found = { hits: [], seen: [], inspected: 0 };
  const inCall: [number, number][] = [];
  for (const match of source.matchAll(CALL)) {
    if (!isCode[match.index]) continue;
    // A declaration (`const say = (…`, `function notify(`) is not a call.
    if (/(?:const|let|function)\s+$/.test(source.slice(Math.max(0, match.index - 10), match.index))) continue;
    const open = match.index + match[0].length - 1;
    inCall.push([open, closeOf(source, isCode, open)]);
  }
  for (const entry of templates) {
    const inToastCall = inCall.some(([from, to]) => entry.start > from && entry.start < to);
    // The statement the template sits in: back to the last `;`, `{` or `}` (a `{ reason: …` keeps its key).
    const before = source.slice(Math.max(0, entry.start - 160), entry.start);
    const statement = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('}')) + 1);
    const inSentenceStatement = SENTENCE_STATEMENT.test(statement.slice(statement.lastIndexOf('{') + 1));
    if (!inToastCall && !inSentenceStatement) continue;
    for (const expression of entry.exprs) {
      const text = expression.text.trim();
      // An expression that holds a template of its own: that template is read on its own.
      if (text.includes('`')) continue;
      if (!nameish(text)) continue;
      found.inspected++;
      const key = `${file}: ${text}`;
      found.seen.push(key);
      if (!wrappedWhole(text)) found.hits.push(key);
    }
  }
  return found;
}

/** A name the app itself defines, not a narrator's or an author's: allowed, with why. The key is `<file>: <expression>`; an entry that no toast uses any more fails. */
const APP_DEFINED: Record<string, string> = {
  'components/booth/leave/useBoothLeaveGuard.ts: now.daw.name': 'the name of a DAW product (REAPER, Audacity) or the built-in recorder',
  'components/booth/page/useBoothPage.ts: recorderLabel': 'the name of a DAW product (REAPER, Audacity) or the built-in recorder',
  'components/booth/record/RecordSetup.tsx: Name': 'the name of a DAW product (REAPER, Audacity) or the built-in recorder',
  'components/booth/toastSentences.ts: name': 'the name of a DAW product (REAPER, Audacity) or the built-in recorder',
  'components/connection/useReaperLaunch.ts: name': 'the name of a DAW product (REAPER, Audacity) or the built-in recorder',
  "App.tsx: newest?.label ?? 'the last change'": 'a journal label (the text of an Undo entry) shown bare in a toast: a known gap, #4129',
  'studio/journal/createJournal.ts: blocker.label': 'a journal label (the text of an Undo entry) shown bare in a toast: a known gap, #4129',
  'studio/journal/createJournal.ts: newest.label': 'a journal label (the text of an Undo entry) shown bare in a toast: a known gap, #4129',
  'components/engine/chapterSyncText.ts: readable(item.best.trackName, item.best.trackIndex)':
    'a false positive: the statement holds `item.reason`, but this is panel and dialog text, never a toast',
  'components/primitives/ChapterStepper.tsx: name': 'the name in a tooltip, not a toast',
  'components/settings/row/SettingRowView.tsx: row.label': "the label of a setting, the app's own wording",
  'components/proof/ProofPage.tsx: noteRow(next).resolution.label': 'the label of a resolution kind the app defines ("Fine as read")',
  'components/proof/CompareRun.tsx: modelLabel(value)': 'the name of a model the app ships',
  'components/master/MasteringChain.tsx: row.label': 'the label of a mastering step the app defines',
  'components/editing/bar/SelectionActionButton.tsx: hint ?? label': 'the label of a button, in a tooltip',
  'components/storybible/usePreviewAudio.ts: error.name': 'the name of a browser error kind (AbortError)',
  'components/settings/models/AssetsStore.tsx: name': 'the name of a model the app ships',
  'components/storybible/GuideDetail.tsx: capitalize(stuck.label)':
    'a leave-guard label: it can hold a narrator name (built at GuideDetail :396 and :421), shown bare in a toast on a save refusal; a known gap, #4129',
};

/** A product name the app defines, whichever file it is in: the DAW's name (REAPER, Audacity), never a narrator's or an author's. */
const DAW_NAMES = /^(?:capitalised\()?(?:\w+\.)?dawName\)?$|^daw\.name$|^recorderName\(/;
/** Files where a bare `name` is the DAW's name (a parameter of that file's sentences). */
const DAW_NAME_FILES = new Set<string>([
  'components/booth/record/RecordSetup.tsx',
  'components/booth/record/SetupChip.tsx',
  'components/connection/useDawStatus.ts',
  'components/engine/AddMarkers.tsx',
  'components/engine/ShowInDaw.tsx',
  'studio/journal/createJournal.ts',
]);

/** Files that are toast builders: every template literal in them is a toast sentence, however it reaches the toast. */
const BUILDERS = new Set(['components/production/chapterSyncToastText.ts', 'components/booth/toastSentences.ts']);

function scanTree(): Found & { everything: Set<string> } {
  const all: Found & { everything: Set<string> } = { hits: [], seen: [], inspected: 0, everything: new Set() };
  const allowed = (file: string, key: string): boolean => {
    const expression = key.slice(key.indexOf(': ') + 2);
    return key in APP_DEFINED || DAW_NAMES.test(expression) || (DAW_NAME_FILES.has(file) && expression === 'name');
  };
  for (const path of sources(SRC)) {
    const file = relative(SRC, path).split(sep).join('/');
    if (NOT_READ.test(file)) continue;
    const source = readFileSync(path, 'utf8');
    const result = BUILDERS.has(file)
      ? scanSource(file, `overlay.toast(${source.replace(/\b(?:export )?(?:const|function)\b/g, ' ')})`)
      : scanSource(file, source);
    for (const key of result.seen) all.everything.add(key);
    all.hits.push(...result.hits.filter((key) => !allowed(file, key)));
    all.seen.push(...result.seen);
    all.inspected += result.inspected;
  }
  return all;
}

describe('every name in a toast sentence is isolated (#4113)', () => {
  const tree = scanTree();

  it('wraps each narrator or author name in isolatedIfRtl, or is allowed here with a reason', () => {
    expect(
      tree.hits.map(
        (key) =>
          `${key} goes into a toast sentence without isolatedIfRtl (visibleText.ts); wrap it whole, or add it to APP_DEFINED with why it is the app's own word`,
      ),
    ).toEqual([]);
  });

  it('keeps no allowed name that nothing reads any more', () => {
    expect(Object.keys(APP_DEFINED).filter((key) => !tree.everything.has(key))).toEqual([]);
  });

  it('reads the sentences it is meant to read: some wrapped names, and not few', () => {
    expect(tree.inspected).toBeGreaterThan(40);
    expect(tree.seen.some((key) => key.startsWith('components/production/useChapterTools.tsx: '))).toBe(true);
    expect(tree.seen.some((key) => key.startsWith('components/editing/range/fx/fxCommand.ts: '))).toBe(true);
  });
});

// The scan itself: each way a name can reach a toast, and each way the scan could be blinded.
describe('the scan that checks the isolates (#4113)', () => {
  const hits = (source: string) => scanSource('x.tsx', source).hits;

  it('catches a name in a toast call, and passes the same name wrapped', () => {
    expect(hits('overlay.toast(`${chapter.title} restored.`);')).toEqual(['x.tsx: chapter.title']);
    expect(hits('overlay.toast(`${isolatedIfRtl(chapter.title)} restored.`);')).toEqual([]);
    expect(hits('notify(`${bidiIsolated(entry.name)} removed.`);')).toEqual([]);
  });

  it('catches a name that is only half wrapped, or whose joined list is wrapped as one unit', () => {
    expect(hits('notify(`${ok ? isolatedIfRtl(a.title) : b.title} restored.`);')).toEqual(['x.tsx: ok ? isolatedIfRtl(a.title) : b.title']);
    expect(hits('notify(`${wrap(isolatedIfRtl(x)) + c.name} restored.`);')).toHaveLength(1);
    expect(hits('notify(`${isolatedIfRtl(a.title) + b.name} restored.`);')).toHaveLength(1);
    expect(hits("notify(`${isolatedIfRtl(entries.map((e) => e.name).join(', '))} removed.`);")).toHaveLength(1);
  });

  it('reads a call on any object, ?., a call result or a bare toast, not only overlay', () => {
    expect(hits('service.toast(`${item.name} done.`);')).toHaveLength(1);
    expect(hits('appOverlay.toastUndo(`${item.name} done.`, undo);')).toHaveLength(1);
    expect(hits('overlay?.toast(`${item.name} done.`);')).toHaveLength(1);
    expect(hits('useOverlay().toast(`${item.name} done.`);')).toHaveLength(1);
    expect(hits('const { toast } = o; toast(`${item.name} done.`);')).toHaveLength(1);
  });

  it('reads a sentence built into message or reason before it reaches a toast', () => {
    expect(hits('let message = `${chain.name} is kept as an effect entry.`;')).toHaveLength(1);
    expect(hits('return { ok: false, refusal: { code: "x", reason: `Could not keep ${take.label}: failed` } };')).toHaveLength(1);
  });

  it('is not blinded by a backtick in a comment, a string or a block comment', () => {
    expect(hits('// a stray ` in a comment\noverlay.toast(`${chapter.title} gone.`);')).toHaveLength(1);
    expect(hits('/* a ` in a block comment */ overlay.toast(`${chapter.title} gone.`);')).toHaveLength(1);
    expect(hits('const a = "a ` b"; overlay.toast(`${chapter.title} gone.`);')).toHaveLength(1);
    expect(hits("const a = 'it`s'; overlay.toast(`${chapter.title} gone.`);")).toHaveLength(1);
  });

  it('does not take a call named in a string or a comment for a call', () => {
    expect(hits('const text = "notify("; const other = `${item.name} done`;')).toEqual([]);
    expect(hits('/* notify( */ const other = `${item.name} done`;')).toEqual([]);
  });

  it('reads a template nested in an expression, and ignores a call named in a comment', () => {
    expect(hits('notify(`Saved ${ok ? `${item.name} now` : "nothing"}.`);')).toEqual(['x.tsx: item.name']);
    expect(hits('// notify(`${chapter.title} gone.`)\nconst x = 1;')).toEqual([]);
  });

  it('leaves text that is not a toast sentence alone', () => {
    expect(hits('<button aria-label={`Remove ${entry.name} from recent projects`} />')).toEqual([]);
    expect(hits('const title = `${chapter.title} (draft)`;')).toEqual([]);
    expect(hits('notify(`Linked ${plural(n, "track")}.`);')).toEqual([]);
  });
});
