// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for #4113 (definition of done, rule 1): a name the narrator or an author chose (a chapter title, a track, a character, a profile, a file) that goes into the sentence of a toast is
// wrapped in `isolatedIfRtl` (`visibleText.ts`), or a right-to-left name at the start of the sentence turns the whole line around and the full stop or a count jumps to the wrong side.
//
// This test reads the source with a small lexer (comments, strings and nested templates are skipped, so a stray backtick in a comment blinds nothing). It looks at each `${expression}` of a
// template literal that is a toast sentence, which is one of:
//  - an argument of a call that raises a toast: `overlay.toast`, `overlay.toastUndo`, `service.toast`, any `<object>.toast` / `.toastUndo`, `notify` and `say`;
//  - a sentence built into a variable or a command's result before it gets to a toast: a template in a statement that names `message` or `reason` (`let message = ...`, `{ reason: ... }`),
//    which is how a command hands its words to the toast that shows them. The mock hosts (`api/`), `fixtures/` and `ports/` are not read: they stand in for the host, whose words are not the app's.
// An expression that reads like a name (an identifier ending in name, title, label, path or quote) must be wrapped whole by `isolatedIfRtl` or `bidiIsolated`: a wrapper somewhere inside it
// (`ok ? isolatedIfRtl(a.title) : b.title`) does not count. A name the app itself defines (a setting's label, a product's name) is allowed with the reason in `APP_DEFINED`.
// A template that opens with a name-like expression and ends in a full stop, a question mark or an exclamation mark is checked wherever it is, because helpers build sentences that are
// passed to a toast as values. One that opens with a name and ends otherwise (a tooltip, a label, a path) is not a sentence and is not read.
// Not read: a sentence that reaches a toast some other way (built in another file and passed in as a value, joined with `+`, or from the host: the Go host words some, which get the
// direction rule of `textDirection` only), `overlay.announce` (read out, never drawn), and the builders in `engine/destination.ts` (their unit tests, `destination.test.ts`).
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

const CALL = /(?:\b[\w$]+\.toast|\b[\w$]+\.toastUndo|\bnotify|\bsay)\(/g;
const SENTENCE_STATEMENT = /\b(?:message|reason)\b/;
const NAMEISH = /\b\w*(?:[Nn]ame|[Tt]itle|[Ll]abel|[Pp]ath|[Qq]uote)\b/;
/** A template that ends its words with a full stop, a question mark or an exclamation mark is a sentence, and a label, a tooltip or a path is not. */
const SENTENCE_END = /^.* .*[.!?]$/s;
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
  return closeOf(text, isCode, match[0].length - 1) === text.length;
}

type Found = { hits: string[]; seen: string[]; inspected: number; leading: string[] };

/** The name-like expressions that go into toast sentences in one source, and which of them are not wrapped. A key is `<file>: <expression>`. */
export function scanSource(file: string, source: string): Found {
  const { templates, isCode } = lex(source);
  const found: Found = { hits: [], seen: [], inspected: 0, leading: [] };
  const inCall: [number, number][] = [];
  for (const match of source.matchAll(CALL)) {
    if (!isCode[match.index]) continue;
    // A declaration (`const say = (…`, `function notify(`) is not a call.
    if (/(?:const|let|function)\s+$/.test(source.slice(Math.max(0, match.index - 10), match.index))) continue;
    const open = match.index + match[0].length - 1;
    inCall.push([open, closeOf(source, isCode, open)]);
  }
  for (const entry of templates) {
    // A template that opens with a name (`${title} restored.`) is a sentence led by it, wherever it goes: helper-built sentences are passed to a toast as values, which the scan cannot follow.
    const first = entry.exprs[0];
    const last = entry.exprs[entry.exprs.length - 1];
    const tail = last ? source.slice(last.start + last.text.length + 1, entry.end) : '';
    if (
      first &&
      SENTENCE_END.test(tail) &&
      first.start === entry.start + 3 &&
      !first.text.includes('`') &&
      NAMEISH.test(first.text) &&
      !wrappedWhole(first.text)
    ) {
      found.leading.push(`${file}: ${first.text.trim()}`);
    }
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
      if (!NAMEISH.test(text)) continue;
      found.inspected++;
      const key = `${file}: ${text}`;
      found.seen.push(key);
      if (!wrappedWhole(text)) found.hits.push(key);
    }
  }
  return found;
}

/** A name the app itself defines, not a narrator's or an author's: allowed, with why. The key is `<file>: <expression>`. */
const APP_DEFINED: Record<string, string> = {
  'components/settings/row/SettingRowView.tsx: row.label': "the label of a setting, the app's own English wording",
  'components/proof/ProofPage.tsx: noteRow(next).resolution.label': 'the label of a resolution kind the app defines ("Fine as read")',
  'components/proof/CompareRun.tsx: modelLabel(value)': 'the name of a model the app ships',
  'components/proof/CompareRun.tsx: dawName': 'the name of a DAW product (REAPER, Audacity)',
  'components/booth/leave/useBoothLeaveGuard.ts: now.daw.name': 'the name of a DAW product (REAPER, Audacity)',
  'components/booth/record/useRecordControl.ts: recorderName(capabilitiesRef.current?.daw)': 'the name of a DAW product (REAPER, Audacity)',
  'components/booth/page/useBoothPage.ts: recorderLabel': 'the name of a DAW product (REAPER, Audacity)',
  'components/booth/record/RecordSetup.tsx: Name': 'the name of a DAW product (REAPER, Audacity)',
  'components/booth/toastSentences.ts: recorderName(daw)': 'the name of a DAW product (REAPER, Audacity)',
  'components/booth/toastSentences.ts: name': 'the name of a DAW product, given by the caller',
  'components/booth/toastSentences.ts: dawName': 'the name of a DAW product (REAPER, Audacity)',
  'components/connection/useReaperLaunch.ts: name': 'the name of the DAW product the launch started',
  'components/script/page/data/useScriptData.ts: kind?.name ?? type': 'the name of a note kind the app defines',
  'components/editing/bar/SelectionActionButton.tsx: hint ?? label': "the label of a button, the app's own wording, in a tooltip",
  'components/master/MasteringChain.tsx: row.label': 'the label of a mastering step the app defines',
  'components/primitives/ChapterStepper.tsx: name': 'the name of a step of the stepper in a tooltip, not a toast',
  'components/storybible/usePreviewAudio.ts: error.name': 'the name of a browser error kind (AbortError)',
  'components/settings/models/AssetsStore.tsx: name': 'the name of a model the app ships',
  'components/storybible/GuideDetail.tsx: capitalize(stuck.label)': "the label of a field of the Story Bible form, the app's own wording",
};

/**
 * A template that opens with a name-like expression and is not a sentence a narrator reads as one with an author's or narrator's name in it: a DAW's name, a key, a menu path, text that is not
 * shown in a sentence. The key is `<file>: <expression>`; each has the reason.
 */
const LEADS_NOT_A_NARRATOR_NAME: Record<string, string> = {
  'components/booth/record/RecordSetup.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/booth/record/recordCheck.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/booth/record/takeWords.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/booth/record/useRecordControl.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/connection/ReaperOffDialog.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/connection/useDawStatus.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/editing/bar/useScriptPlayback.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/engine/AddMarkers.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/engine/ShowInDaw.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'playback/providers.ts: name': 'the name of a DAW product (REAPER, Audacity)',
  'studio/dawNames.ts: capitalised(name)': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'studio/dawNames.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/engine/VoicesCard.tsx: name': 'isolated where it is bound (isolatedIfRtl(shortName(...)))',
  'components/connection/ChapterLinkDialog.tsx: createLabel': 'the label of the button the app draws (Create tracks)',
  'components/delivery/profile/ProfileCard.tsx: rule.label': 'a label the app itself defines (a setting, a rule, an engine, a model it ships)',
  'components/layout/EngineChip.tsx: audacityTitle(forAudacity)': "the app's own tooltip title for the engine chip",
  'components/master/MasteringApprovalDialog.tsx: plan.label': 'a label the app itself defines (a setting, a rule, an engine, a model it ships)',
  'components/recordingcheck/runChoices.ts: engine.label': 'a label the app itself defines (a setting, a rule, an engine, a model it ships)',
  'components/settings/ScopedSetting.tsx: choiceLabel(rowOfField(tool, field.key), value)':
    'a label the app itself defines (a setting, a rule, an engine, a model it ships)',
  'components/settings/data/SettingsStore.tsx: row.label': 'a label the app itself defines (a setting, a rule, an engine, a model it ships)',
  'components/settings/models/AssetsStore.tsx: item.displayName': "the name of a model the app ships, in the page's live region",
  'components/settings/page/ModelsPane.tsx: name': "the name of a model the app ships, in the page's notice",
  'components/settings/page/ScopedFieldsPanel.tsx: field.label': 'a label the app itself defines (a setting, a rule, an engine, a model it ships)',
};

/** A product name the app defines, whichever file it is in: the DAW's name (REAPER, Audacity), never a narrator's or an author's. */
const DAW_NAMES = /^(?:\w+\.)?dawName$|^daw\.name$|^recorderName\(/;
/** Files where a bare `name` is the DAW's name (a parameter of that file's sentences). */
const DAW_NAME_FILES = new Set([
  'components/booth/record/RecordSetup.tsx',
  'components/booth/record/SetupChip.tsx',
  'components/connection/useDawStatus.ts',
  'components/engine/AddMarkers.tsx',
  'components/engine/ShowInDaw.tsx',
  'studio/journal/createJournal.ts',
]);

/** Files that are toast builders: every template literal in them is a toast sentence, however it reaches the toast. */
const BUILDERS = new Set(['components/production/chapterSyncToastText.ts', 'components/booth/toastSentences.ts']);

function scanTree(): Found {
  const all: Found = { hits: [], seen: [], inspected: 0, leading: [] };
  for (const path of sources(SRC)) {
    const file = relative(SRC, path).split(sep).join('/');
    if (NOT_READ.test(file)) continue;
    const source = readFileSync(path, 'utf8');
    const result = BUILDERS.has(file)
      ? scanSource(file, `overlay.toast(${source.replace(/\b(?:export )?(?:const|function)\b/g, ' ')})`)
      : scanSource(file, source);
    all.hits.push(
      ...result.hits.filter(
        (key) => !(key in APP_DEFINED) && !DAW_NAMES.test(key.slice(key.indexOf(': ') + 2)) && !(DAW_NAME_FILES.has(file) && key.endsWith(': name')),
      ),
    );
    all.seen.push(...result.seen);
    all.inspected += result.inspected;
    all.leading.push(
      ...result.leading.filter((key) => !(key in LEADS_NOT_A_NARRATOR_NAME) && !(key in APP_DEFINED) && !DAW_NAMES.test(key.slice(key.indexOf(': ') + 2))),
    );
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

  it('wraps a name that opens a sentence, wherever the sentence goes (a helper builds it, a toast shows it)', () => {
    expect(tree.leading.map((key) => `${key} opens a template without isolatedIfRtl: a right-to-left name leading a sentence turns it round`)).toEqual([]);
  });

  it('keeps no allowed name that is no longer in a toast sentence', () => {
    const seen = new Set(tree.seen);
    expect(Object.keys(APP_DEFINED).filter((key) => !seen.has(key))).toEqual([]);
  });

  it('reads the sentences it is meant to read: some wrapped names, some allowed ones, and not few', () => {
    expect(tree.inspected).toBeGreaterThan(60);
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

  it('catches a name that is only half wrapped', () => {
    expect(hits('notify(`${ok ? isolatedIfRtl(a.title) : b.title} restored.`);')).toEqual(['x.tsx: ok ? isolatedIfRtl(a.title) : b.title']);
    expect(hits('notify(`${wrap(isolatedIfRtl(x)) + c.name} restored.`);')).toHaveLength(1);
    expect(hits('notify(`${isolatedIfRtl(a.title) + b.name} restored.`);')).toHaveLength(1);
  });

  it('reads a call on any object, not only overlay', () => {
    expect(hits('service.toast(`${item.name} done.`);')).toHaveLength(1);
    expect(hits('appOverlay.toastUndo(`${item.name} done.`, undo);')).toHaveLength(1);
  });

  it('reads a sentence built into a variable or a command result before it reaches a toast', () => {
    expect(hits('let message = `${chain.name} is kept as an effect entry.`;')).toHaveLength(1);
    expect(hits('return { ok: false, refusal: { code: "x", reason: `Could not keep ${take.label}: failed` } };')).toHaveLength(1);
    expect(hits('const message = `Split ${target.label} at 0:03.`;')).toHaveLength(1);
  });

  it('is not blinded by a backtick in a comment, a string or a regular expression-free line', () => {
    expect(hits('// a stray ` in a comment\noverlay.toast(`${chapter.title} gone.`);')).toHaveLength(1);
    expect(hits('/* a ` and another ` */ overlay.toast(`${chapter.title} gone.`);')).toHaveLength(1);
    expect(hits('const a = "a ` b"; overlay.toast(`${chapter.title} gone.`);')).toHaveLength(1);
    expect(hits("const a = 'it`s'; overlay.toast(`${chapter.title} gone.`);")).toHaveLength(1);
  });

  it('reads a template nested in an expression, and ignores a call named in a comment', () => {
    expect(hits('notify(`Saved ${ok ? `${item.name} now` : "nothing"}.`);')).toEqual(['x.tsx: item.name']);
    expect(hits('// notify(`${chapter.title} gone.`)\nconst x = 1;')).toEqual([]);
  });

  it('flags a sentence that opens with a name wherever it is built, and not a label or a wrapped name', () => {
    const leading = (source: string) => scanSource('x.ts', source).leading;
    expect(leading('const text = `${chapter.title} moved to Editing.`;')).toEqual(['x.ts: chapter.title']);
    expect(leading('const text = `${isolatedIfRtl(chapter.title)} moved to Editing.`;')).toEqual([]);
    expect(leading('const tip = `${chapter.title} (draft)`;')).toEqual([]);
    expect(leading('const text = `Moved ${chapter.title} to Editing.`;')).toEqual([]);
  });

  it('leaves text that is not a toast sentence alone', () => {
    expect(hits('<button aria-label={`Remove ${entry.name} from recent projects`} />')).toEqual([]);
    expect(hits('const title = `${chapter.title} (draft)`;')).toEqual([]);
    expect(hits('notify(`Linked ${plural(n, "track")}.`);')).toEqual([]);
  });
});
