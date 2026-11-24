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
// Not read: an alias of a toast function (`const t = overlay.toast`), a backtick inside a regular expression literal, a name reached through a function or `names.join(', ')` that is not
// name-like, a second template in a ternary after a `}`, and a `message:` more than 160 characters before its template.
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

const CALL = /(?:(?:\?\.|\.)(?:toast|toastUndo)|(?<![\w$.])(?:toast|toastUndo)|\bnotify|\bsay)\(/g;
const SENTENCE_STATEMENT = /\b(?:message|reason|done|success|undoText|sentence|why|notice)\b/;
const NAMEISH =
  /\b\w*(?:[Nn]ame|[Tt]itle|[Ll]abel|[Pp]ath|[Qq]uote|[Tt]erm|[Qq]uery|[Cc]hapter|[Tt]rack|[Vv]oice|[Pp]roject|[Pp]rofile|[Ee]ntry|[Ss]peaker|[Cc]haracter|[Hh]eading|[Ff]older|[Ff]ile|[Ww]ho|[Mm]ilestone|[Ss]hort|[Dd]evice|[Ss]ource|[Oo]wner)\b/;
/** Whether an expression reads like a name; the words inside its quotes (`plural(n, 'track')`) are text, not names. */
const nameish = (expression: string): boolean => NAMEISH.test(expression.replace(/(['"])(?:\\.|(?!\1).)*\1/g, "''"));

/** A template that ends its words with a full stop, a question mark or an exclamation mark is a sentence, and a label, a tooltip or a path is not. */
const SENTENCE_END = /[.!?]$/;
/** A plain identifier or member access (`short`, `names[0]`, `row.chapter`). */
const PLAIN = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\]]*\])*$/;
/** Plain identifiers that hold a count or a number, never a name. */
const COUNTISH =
  /^(?:\w*(?:[Cc]ount|[Nn]umber|[Tt]otal|[Ll]ength|[Ss]ize|[Ii]ndex|[Ss]econds|[Mm]s|[Mm]b|[Vv]ersion|[Rr]evision)|n|i|k|size|done|kept|queued|found|steps|total|at)$/;
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
    const last = entry.exprs[entry.exprs.length - 1];
    const tail = last ? source.slice(last.start + last.text.length + 1, entry.end) : '';
    // Any sentence, wherever it is built, with a name-like expression in it: helpers build sentences that are passed to a toast as values, which the scan cannot follow.
    if (last && SENTENCE_END.test(tail) && /\s/.test(source.slice(entry.start, entry.end))) {
      for (const expression of entry.exprs) {
        const text = expression.text.trim();
        if (!text.includes('`') && nameish(text) && !wrappedWhole(text)) found.leading.push(`${file}: ${text}`);
      }
      // The first thing in a sentence matters most: any plain identifier or member that opens it (`${chapter} is linked…`) is read as a name, whatever it is called.
      const first = entry.exprs[0];
      if (first && first.start - entry.start <= 4 && PLAIN.test(first.text.trim()) && !nameish(first.text) && !COUNTISH.test(first.text.trim()))
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
      if (!nameish(text)) continue;
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
  'components/editing/page/useRereadFeedback.ts: name.slice(0, MAX_NAME - 1)': 'cut to length here, isolated by the caller (isolatedIfRtl(nameIn(...)))',
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
  'App.tsx: short':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  "App.tsx: /[.!?…]$/.test(short) ? '' : '.'":
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/editing/range/fx/fxMenu.ts: source':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'App.tsx: message':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/booth/frame/LevelsMenu.tsx: device':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/booth/leave/stopRecordingSpec.ts: subject':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/booth/page/useBoothPage.ts: stopped.message':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/booth/page/useBoothPage.ts: undone.message':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/booth/record/takeWords.ts: TAKE_ENDED':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/booth/record/useRecordControl.ts: what':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/booth/roll/rollConfirm.ts: subject':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/booth/roll/useRoll.ts: plan.reason':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/booth/voices/useBoothVoices.ts: COLD_READ_NO_VOICE_REASON':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/delivery/page/Preflight.tsx: run.job.message':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/delivery/page/Preflight.tsx: ROW':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/editing/backups/backupsText.ts: message':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/editing/cleanup/cleanupApply.ts: stale.length':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/editing/effects/EffectSettings.tsx: notKept':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/editing/follow/useDawTransportSync.ts: daw':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/editing/follow/wordClock.ts: daw':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/editing/range/fx/fxText.ts: FX_FADE_MS':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/editing/range/replace/useReplaceAudio.tsx: dawCaps.daw':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/editing/stack/stackPlan.ts: caps.daw':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/editing/takes/prep/usePrepSteps.tsx: caps.daw':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/engine/AddMarkers.tsx: skipped':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/engine/ChapterLinksTable.tsx: who':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/engine/ChapterLinksTable.tsx: linked':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/engine/VoicesCard.tsx: lead':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/engine/chapterSyncText.ts: subject':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/layout/AddressGate.tsx: reason':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/master/DiagnosticsSection.tsx: job.message':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/master/fileVerdict.ts: describeMiss(rule, result, owner)':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/masterqc/page/MeasureRun.tsx: run.job.message':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/pickups/list/usePickupsContextMenu.ts: NO_NOTE':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/production/ChapterTrackPanel.tsx: Noun':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/proof/ProoferSheet.tsx: first':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/recordingcheck/CheckRecordingsButton.tsx: caps.daw':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/recordingcheck/activityView.ts: model':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/recordingcheck/background/BackgroundChecksNotice.tsx: chapters':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/recordingcheck/runChoices.ts: first':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/recordingcheck/runChoices.ts: how':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/recordingcheck/workerPlan.ts: lead':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/schedule/ContractPanel.tsx: text':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/schedule/dates.ts: t':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/schedule/draft.ts: t':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/settings/controls/EngineBody.tsx: daw':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/settings/controls/EngineBody.tsx: option.daw':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/settings/controls/EngineBody.tsx: foundFiles.length':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'components/settings/row/OpenLogFolderButton.tsx: FAILED':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'daw/dawSession.ts: daw':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'interactionFeedback/daw.ts: what':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'playback/providers.ts: caps.daw':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  'studio/drafts/draftSentence.ts: why':
    'reviewed in round 5: a message from the host or a constant, a count, a DAW or model name, or text the app words; not a name the narrator or an author chose',
  "components/engine/LinkChaptersDialog.tsx: sharing.map(({ chapter }) => isolatedIfRtl(chapterName(chapter, 'short'))).join(', ')":
    'each name is isolated before the join',
  'components/booth/record/RecordSetup.tsx: guide.installFile': "a label the app itself defines, a count or a number: not a narrator's name",
  "components/booth/voices/WhoIsInDialog.tsx: keyName(String(ask.kind === 'key' ? ask.key : ''))":
    "a label the app itself defines, a count or a number: not a narrator's name",
  'components/delivery/page/chapterStates.ts: notReadyWhy(file)': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/editing/cleanup/cleanupApply.ts: appliedLabel(kind, outcome.applied.length, params)':
    "a label the app itself defines, a count or a number: not a narrator's name",
  'components/editing/effects/ChooseInDaw.tsx: choice?.label': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/editing/ribbon/useRangeInteraction.ts: rangeLabel(span, wordsCovered(words, span).keys.length)':
    "a label the app itself defines, a count or a number: not a narrator's name",
  'components/master/DeliveryProfilePanel.tsx: title': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/master/DeliveryProfilePanel.tsx: profile.revision': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/master/MasteringChain.tsx: label': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/master/fileVerdict.ts: rule.label': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/recordingcheck/runChoices.ts: chunkLabel(choices.chunkSeconds)': "a label the app itself defines, a count or a number: not a narrator's name",
  "components/schedule/draft.ts: plural([...name].length, 'character')": "a label the app itself defines, a count or a number: not a narrator's name",
  'components/settings/KeyboardPanel.tsx: gestureLabel(captured)': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/settings/KeyboardPanel.tsx: conflictCommand.label': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/settings/analysis/AnalysisToolsSection.tsx: removing.displayName': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/settings/page/ModelsPane.tsx: removing.item.displayName': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/stages/useStageRecommendations.ts: stageLabel(chapter.from)': "a label the app itself defines, a count or a number: not a narrator's name",
  'input/commandProviders.ts: command.label': "a label the app itself defines, a count or a number: not a narrator's name",
  'input/commandProviders.ts: clash.label': "a label the app itself defines, a count or a number: not a narrator's name",
  'playback/providers.ts: providers[0].name': "a label the app itself defines, a count or a number: not a narrator's name",
  'studio/journal/createJournal.ts: dawName()': "a label the app itself defines, a count or a number: not a narrator's name",
  'components/booth/ReadAlongView.tsx: t.prompt.model.displayName': 'the name of a model the app ships',
  'components/booth/WhisperModelPrompt.tsx: prompt.model.displayName': 'the name of a model the app ships',
  'components/booth/listening/ListeningModelPrompt.tsx: prompt.model.displayName': 'the name of a model the app ships',
  'components/booth/resume/resumeOfferModel.ts: result.model.displayName': 'the name of a model the app ships',
  'components/proof/CompareRun.tsx: whisperPrompt.model.displayName': 'the name of a model the app ships',
  'components/recordingcheck/CheckRecordingsDialog.tsx: ask.model.displayName': 'the name of a model the app ships',
  'components/recordingcheck/CheckRecordingsDialog.tsx: firstLabel': 'the name of a model the app ships',
  'components/recordingcheck/checkRun.ts: answer.model.displayName': 'the name of a model the app ships',
  'components/recordingcheck/workerPlan.ts: plan.modelLabel': 'the name of a model the app ships',
  'components/booth/record/recordCheck.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/booth/record/useRecordControl.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/editing/EditingPage.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/editing/bar/useScriptPlayback.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/masterqc/page/MasterPage.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/pickups/PickupsPage.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/pickups/list/usePlayOriginal.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/production/ProductionPage.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/proof/ProofPage.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'playback/providers.ts: provider.name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'playback/providers.ts: capitalised(name)': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'studio/dawNames.ts: name.charAt(0).toUpperCase()': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'studio/dawNames.ts: name.slice(1)': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  "components/booth/record/useRecordControl.ts: otherProject ? 'has another project open' : 'is recording another track'":
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/editing/drawer/drawerSections.ts: section.label':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/editing/range/common/locate.ts: name':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/editing/takes/prep/usePrepSteps.tsx: STEP_TEXT[step].entry':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/editing/takes/split/splitFixtures.ts: chapter':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/master/ReportExportPanel.tsx: brand.identity.projectFolder':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  "components/masterqc/files/rows.ts: file.error ?? 'the file could not be read.'":
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  "components/proof/inspector/FindingThread.tsx: message.who === 'you' ? 'your' : 'the proofer’s'":
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/script/page/rail/threads/NoteCard.tsx: message.who':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/script/page/rail/threads/noteKeys.ts: message.who':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/settings/DeliveryProfileEditor.tsx: profile.revision + 1':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/settings/DeliveryProfilesPanel.tsx: profile.revision':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/settings/ScopedSetting.tsx: field.label.toLowerCase()':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/settings/UpdatesPanel.tsx: brand.name':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/settings/page/ModelsPane.tsx: list(plan.blocked.map((row) => row.label))':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/settings/page/ModelsPane.tsx: list(removingUses.map(settingLabel))':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/storybible/propertyDraft.ts: field.label':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/storybible/source/NamePronunciation.tsx: candidate.label':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/storybible/source/NamePronunciation.tsx: source.label':
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  "components/stages/useStageRecommendations.ts: previous.target ? stageLabel(previous.target) : 'the next stage'":
    'a label the app itself defines (a setting, a rule, a step, a source, a key, a number), or text that is not shown to a narrator as a sentence',
  'components/editing/page/noAudioText.ts: chapter': 'page or dialog text the app words, not a toast; the element it sits in sets its own direction',
  'components/engine/destination.ts: chapter': 'page or dialog text the app words, not a toast; the element it sits in sets its own direction',
  'components/stages/useStageRecommendations.ts: name': 'isolated where it is bound (isolatedIfRtl(chapterName(...)))',
  'components/script/page/tools/find/useBookFind.ts: quoteTerm(term)': 'isolated inside quoteTerm',
  "components/settings/UpdatesPanel.tsx: hasProject ? \" with the same project, and REAPER's launcher keeps working\" : ', at the project picker'":
    "the app's own words",
  "studio/drafts/draftSentence.ts: held.length === 1 ? (/^\\d/.test(first.label) ? 'them' : 'it') : describeHeld(held)": "the app's own words",
  'visibleText.ts: plainName(name)': "the helper's own result",
  'components/editing/bar/useScriptPlayback.ts: capitalised(name)': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/booth/record/RecordSetup.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/booth/record/takeWords.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/connection/ReaperOffDialog.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/connection/useDawStatus.ts: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/engine/AddMarkers.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
  'components/engine/ShowInDaw.tsx: name': 'the name of a DAW product (REAPER, Audacity) in a sentence about it',
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
const DAW_NAMES = /^(?:capitalised\()?(?:\w+\.)?dawName\)?$|^daw\.name$|^recorderName\(/;
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

type Tree = Found & { everything: Set<string> };

const expressionOf = (key: string): string => key.slice(key.indexOf(': ') + 2);

function scanTree(): Tree {
  const all: Tree = { hits: [], seen: [], inspected: 0, leading: [], everything: new Set() };
  const allowed = (file: string, key: string): boolean =>
    key in APP_DEFINED || key in LEADS_NOT_A_NARRATOR_NAME || DAW_NAMES.test(expressionOf(key)) || (DAW_NAME_FILES.has(file) && expressionOf(key) === 'name');
  for (const path of sources(SRC)) {
    const file = relative(SRC, path).split(sep).join('/');
    if (NOT_READ.test(file)) continue;
    const source = readFileSync(path, 'utf8');
    const result = BUILDERS.has(file)
      ? scanSource(file, `overlay.toast(${source.replace(/\b(?:export )?(?:const|function)\b/g, ' ')})`)
      : scanSource(file, source);
    for (const key of [...result.seen, ...result.leading]) all.everything.add(key);
    all.hits.push(...result.hits.filter((key) => !allowed(file, key)));
    all.leading.push(...result.leading.filter((key) => !allowed(file, key)));
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

  it('wraps a name in any sentence, wherever the sentence is built (a helper builds it, a toast shows it)', () => {
    expect(
      tree.leading.map(
        (key) =>
          `${key} is in a sentence without isolatedIfRtl: a right-to-left name in it can turn it round; wrap it, or add it to LEADS_NOT_A_NARRATOR_NAME with why`,
      ),
    ).toEqual([]);
  });

  it('keeps no allowed name or file that nothing reads any more', () => {
    expect([...Object.keys(APP_DEFINED), ...Object.keys(LEADS_NOT_A_NARRATOR_NAME)].filter((key) => !tree.everything.has(key))).toEqual([]);
    expect([...DAW_NAME_FILES].filter((file) => !tree.everything.has(`${file}: name`))).toEqual([]);
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
    expect(hits('/* a ` in a block comment */ overlay.toast(`${chapter.title} gone.`);')).toHaveLength(1);
    expect(hits('const a = "a ` b"; overlay.toast(`${chapter.title} gone.`);')).toHaveLength(1);
    expect(hits("const a = 'it`s'; overlay.toast(`${chapter.title} gone.`);")).toHaveLength(1);
  });

  it('reads a call made through ?., a call result, or a bare toast, and not a call named in a string or a comment', () => {
    expect(hits('overlay?.toast(`${item.name} done.`);')).toHaveLength(1);
    expect(hits('useOverlay().toast(`${item.name} done.`);')).toHaveLength(1);
    expect(hits('const { toast } = o; toast(`${item.name} done.`);')).toHaveLength(1);
    expect(hits('const text = "notify("; const other = `${item.name} done`;')).toEqual([]);
    expect(hits('/* notify( */ const other = `${item.name} done`;')).toEqual([]);
  });

  it('flags any plain identifier that opens a sentence, whatever it is called, and not a count', () => {
    expect(scanSource('x.ts', 'const s = `${short} is linked to x.`;').leading).toEqual(['x.ts: short']);
    expect(scanSource('x.ts', 'const s = `${names[0]} looks like it.`;').leading).toEqual(['x.ts: names[0]']);
    expect(scanSource('x.ts', 'const s = `${listening.device} was not found.`;').leading).toEqual(['x.ts: listening.device']);
    expect(scanSource('x.ts', 'const s = `${count} tracks are linked.`;').leading).toEqual([]);
  });

  it('flags a name that opens a sentence with another expression after it', () => {
    expect(scanSource('x.ts', 'const text = `${chapter.title} moved to ${stage}.`;').leading).toEqual(['x.ts: chapter.title']);
    expect(scanSource('x.ts', 'const text = `${chapterName(chapter)}: ${why}.`;').leading).toEqual(['x.ts: chapterName(chapter)']);
  });

  it('reads a template nested in an expression, and ignores a call named in a comment', () => {
    expect(hits('notify(`Saved ${ok ? `${item.name} now` : "nothing"}.`);')).toEqual(['x.tsx: item.name']);
    expect(hits('// notify(`${chapter.title} gone.`)\nconst x = 1;')).toEqual([]);
  });

  it('flags a name in a sentence wherever it is built, and not a label, a count or a wrapped name', () => {
    const leading = (source: string) => scanSource('x.ts', source).leading;
    expect(leading('const text = `${chapter.title} moved to Editing.`;')).toEqual(['x.ts: chapter.title']);
    expect(leading('const text = `${isolatedIfRtl(chapter.title)} moved to Editing.`;')).toEqual([]);
    expect(leading('const tip = `${chapter.title} (draft)`;')).toEqual([]);
    // Not led by the name, quoted, built into a variable that is not `message` or `reason`: all are sentences with a name in them.
    expect(leading('const text = `Moved ${chapter.title} to Editing.`;')).toEqual(['x.ts: chapter.title']);
    expect(leading('const text = `“${chapter.title}” moved.`;')).toEqual(['x.ts: chapter.title']);
    expect(leading('const undoText = `Removed ${speaker}.`;')).toEqual(['x.ts: speaker']);
    expect(leading("const text = `${plural(n, 'track')} linked.`;")).toEqual([]);
    expect(scanSource('x.ts', 'toast(`${who} was removed.`);').hits).toEqual(['x.ts: who']);
    expect(scanSource('x.ts', 'let undoText = `Removed ${voice}.`;').hits).toEqual(['x.ts: voice']);
  });

  it('leaves text that is not a toast sentence alone', () => {
    expect(hits('<button aria-label={`Remove ${entry.name} from recent projects`} />')).toEqual([]);
    expect(hits('const title = `${chapter.title} (draft)`;')).toEqual([]);
    expect(hits('notify(`Linked ${plural(n, "track")}.`);')).toEqual([]);
  });
});
