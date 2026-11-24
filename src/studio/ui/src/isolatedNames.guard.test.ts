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
  /\b\w*(?:[Nn]ame|[Tt]itle|[Ll]abel|[Pp]ath|[Qq]uote|[Tt]erm|[Qq]uery|[Cc]hapter|[Tt]rack|[Vv]oice|[Pp]roject|[Pp]rofile|[Ee]ntry|[Ss]peaker|[Cc]haracter|[Hh]eading|[Ff]older|[Ff]ile|[Ww]ho|[Mm]ilestone|[Ss]hort|[Dd]evice|[Ss]ource|[Oo]wner|[Ii]nput)s?\b/;
/** Whether an expression reads like a name; the words inside its quotes (`plural(n, 'track')`) are text, not names. */
const nameish = (expression: string): boolean => NAMEISH.test(expression.replace(/(['"])(?:\\.|(?!\1).)*\1/g, "''"));

/** A template that ends its words with a full stop, a question mark or an exclamation mark is a sentence, and a label, a tooltip or a path is not. */
const SENTENCE_END = /[.!?]\s*$/;
/** A plain identifier or member access (`short`, `names[0]`, `row.chapter`). */
const PLAIN = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\]]*\])*$/;
/** Plain identifiers that hold a count or a number, never a name. */
const COUNTISH =
  /^(?:\w*(?:[Cc]ount|[Nn]umber|[Tt]otal|[Ll]ength|[Ss]ize|[Ii]ndex|[Ss]econds|[Mm]s|[Mm]b|[Vv]ersion|[Rr]evision)|n|i|k|size|done|kept|queued|found|steps|total|at)$/;
/** An identifier that holds a file name or a path. */
const FILEISH = /\b\w*(?:(?<![Pp]ro)[Ff]ile|[Pp]ath|[Ff]older|[Dd]ir)\w*\b|\bcandidate\.name\b/;
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

type Found = { hits: string[]; seen: string[]; inspected: number; leading: string[]; auto: string[] };

/** The name-like expressions that go into toast sentences in one source, and which of them are not wrapped. A key is `<file>: <expression>`. */
export function scanSource(file: string, source: string): Found {
  const { templates, isCode } = lex(source);
  const found: Found = { hits: [], seen: [], inspected: 0, leading: [], auto: [] };
  const inCall: [number, number][] = [];
  for (const match of source.matchAll(CALL)) {
    if (!isCode[match.index]) continue;
    // A declaration (`const say = (…`, `function notify(`) is not a call.
    if (/(?:const|let|function)\s+$/.test(source.slice(Math.max(0, match.index - 10), match.index))) continue;
    const open = match.index + match[0].length - 1;
    inCall.push([open, closeOf(source, isCode, open)]);
  }
  // A file name or a path reads left to right whatever its letters are: isolated first-strong, an Arabic `name.rpp` is drawn `rpp.name`. So one that holds a file or a path takes 'ltr'.
  for (const call of source.matchAll(/(?<![\w$])isolatedIfRtl\(([^(),]*(?:\([^()]*\))?[^(),]*)\)/g)) {
    if (isCode[call.index] && FILEISH.test(call[1]!.replace(/(['"])(?:\\.|(?!\1).)*\1/g, "''"))) found.auto.push(`${file}: ${call[1]!.trim()}`);
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

/** The reasons an expression is allowed without a wrapper. One text each; an entry names its category, never its history. */
const HOST_MESSAGE = 'a sentence or part of one that the host or the app words itself, with no name the narrator or an author chose in it';
const APP_CONSTANT = 'a fixed string in the source';
const COUNT = 'a number or a count, not a name';
const DAW_NAME = 'the name of a DAW product (REAPER, Audacity) or the built-in recorder';
const MODEL_LABEL = 'the name of a model the app ships';
const PAGE_TEXT_NOT_A_TOAST = 'page or dialog text, not a toast: the element it sits in sets its own direction (joined lists on pages are tracked in #4129)';
const THE_HELPER_ITSELF = 'the helper that does the isolating';
const APP_WORDING = 'a label, step, setting, rule or sentence the app defines';
/** Entries with this reason must have a proof below: the text that isolates the name where it is bound, which the test finds in the file. */
const ALREADY_ISOLATED_AT_BINDING = 'the name is isolated where it is bound or built, not at this use';

/** A name the app itself defines, not a narrator's or an author's: allowed, with why. The key is `<file>: <expression>`. */
const APP_DEFINED: Record<string, string> = {
  'components/editing/page/useRereadFeedback.ts: name.slice(0, MAX_NAME - 1)': ALREADY_ISOLATED_AT_BINDING,
  'components/settings/row/SettingRowView.tsx: row.label': APP_WORDING,
  'components/proof/ProofPage.tsx: noteRow(next).resolution.label': APP_WORDING,
  'components/proof/CompareRun.tsx: modelLabel(value)': MODEL_LABEL,
  'components/proof/CompareRun.tsx: dawName': DAW_NAME,
  'components/booth/leave/useBoothLeaveGuard.ts: now.daw.name': DAW_NAME,
  'components/booth/record/useRecordControl.ts: recorderName(capabilitiesRef.current?.daw)': DAW_NAME,
  'components/booth/page/useBoothPage.ts: recorderLabel': DAW_NAME,
  'components/booth/record/RecordSetup.tsx: Name': DAW_NAME,
  'components/booth/toastSentences.ts: recorderName(daw)': DAW_NAME,
  'components/booth/toastSentences.ts: name': DAW_NAME,
  'components/booth/toastSentences.ts: dawName': DAW_NAME,
  'components/connection/useReaperLaunch.ts: name': DAW_NAME,
  'components/editing/bar/SelectionActionButton.tsx: hint ?? label': APP_WORDING,
  'components/master/MasteringChain.tsx: row.label': APP_WORDING,
  'components/primitives/ChapterStepper.tsx: name': PAGE_TEXT_NOT_A_TOAST,
  'components/storybible/usePreviewAudio.ts: error.name': APP_CONSTANT,
  'components/settings/models/AssetsStore.tsx: name': MODEL_LABEL,
  'components/storybible/GuideDetail.tsx: capitalize(stuck.label)': APP_WORDING,
};

/**
 * A template that opens with a name-like expression and is not a sentence a narrator reads as one with an author's or narrator's name in it: a DAW's name, a key, a menu path, text that is not
 * shown in a sentence. The key is `<file>: <expression>`; each has the reason.
 */
const LEADS_NOT_A_NARRATOR_NAME: Record<string, string> = {
  'components/engine/NestedChaptersNotice.tsx: who': ALREADY_ISOLATED_AT_BINDING,
  "App.tsx: newest?.label ?? 'the last change'": ALREADY_ISOLATED_AT_BINDING,
  'components/engine/ChapterLinksTable.tsx: quoted(found.name, place)': ALREADY_ISOLATED_AT_BINDING,
  "components/engine/chapterSyncText.ts: names.slice(0, -1).join(', ')": ALREADY_ISOLATED_AT_BINDING,
  'components/engine/chapterSyncText.ts: names[0]': ALREADY_ISOLATED_AT_BINDING,
  'components/engine/chapterSyncText.ts: names[names.length - 1]': ALREADY_ISOLATED_AT_BINDING,
  'components/engine/chapterSyncText.ts: quotedList(item.candidates.map((candidate) => readable(candidate.trackName, candidate.trackIndex)))':
    ALREADY_ISOLATED_AT_BINDING,
  "components/storybible/voicesamples/useVoiceSampleActions.tsx: [sampleLength(sample.durationMs), isolatedIfRtl(sample.source.chapterTitle)].filter(Boolean).join(', ')":
    ALREADY_ISOLATED_AT_BINDING,
  'studio/journal/createJournal.ts: blocker.label': ALREADY_ISOLATED_AT_BINDING,
  'studio/journal/createJournal.ts: newest.label': ALREADY_ISOLATED_AT_BINDING,
  "components/engine/NestedChaptersNotice.tsx: folders.length === 1 ? 'its voices' : 'their voices'": APP_WORDING,
  "components/engine/NestedChaptersNotice.tsx: folders.map(folderOf).join(' and ')": ALREADY_ISOLATED_AT_BINDING,
  "components/engine/NestedChaptersNotice.tsx: shownChapters.length === 1 ? 'a chapter' : plural(shownChapters.length, 'chapter')": COUNT,
  "components/engine/NestedChaptersNotice.tsx: shownFolders.join(' and ')": ALREADY_ISOLATED_AT_BINDING,
  'components/engine/useChapterFolders.ts: folders': ALREADY_ISOLATED_AT_BINDING,
  'components/engine/voices.ts: holdsWords(children, voiceFolders)': APP_WORDING,
  'components/production/target/pace.selectors.ts: minChapters': COUNT,
  'components/recordingcheck/runChoices.ts: choices.chapters': COUNT,
  "components/storybible/suggested/row/selectors.ts: plural(context.chapters, 'chapter')": COUNT,
  'App.tsx: short': HOST_MESSAGE,
  "App.tsx: /[.!?…]$/.test(short) ? '' : '.'": APP_WORDING,
  'components/editing/range/fx/fxMenu.ts: source': APP_WORDING,
  'App.tsx: message': HOST_MESSAGE,
  'components/booth/leave/stopRecordingSpec.ts: subject': APP_WORDING,
  'components/booth/page/useBoothPage.ts: stopped.message': HOST_MESSAGE,
  'components/booth/page/useBoothPage.ts: undone.message': HOST_MESSAGE,
  'components/booth/record/takeWords.ts: TAKE_ENDED': APP_CONSTANT,
  'components/booth/record/useRecordControl.ts: what': APP_WORDING,
  'components/booth/roll/rollConfirm.ts: subject': DAW_NAME,
  'components/booth/roll/useRoll.ts: plan.reason': HOST_MESSAGE,
  'components/booth/voices/useBoothVoices.ts: COLD_READ_NO_VOICE_REASON': APP_CONSTANT,
  'components/delivery/page/Preflight.tsx: run.job.message': HOST_MESSAGE,
  'components/delivery/page/Preflight.tsx: ROW': APP_CONSTANT,
  'components/editing/backups/backupsText.ts: message': HOST_MESSAGE,
  'components/editing/cleanup/cleanupApply.ts: stale.length': COUNT,
  'components/editing/effects/EffectSettings.tsx: notKept': APP_WORDING,
  'components/editing/follow/useDawTransportSync.ts: daw': DAW_NAME,
  'components/editing/follow/wordClock.ts: daw': DAW_NAME,
  'components/editing/range/fx/fxText.ts: FX_FADE_MS': APP_CONSTANT,
  'components/editing/range/replace/useReplaceAudio.tsx: dawCaps.daw': DAW_NAME,
  'components/editing/stack/stackPlan.ts: caps.daw': DAW_NAME,
  'components/editing/takes/prep/usePrepSteps.tsx: caps.daw': DAW_NAME,
  'components/engine/AddMarkers.tsx: skipped': COUNT,
  'components/engine/ChapterLinksTable.tsx: who': ALREADY_ISOLATED_AT_BINDING,
  'components/engine/ChapterLinksTable.tsx: linked': ALREADY_ISOLATED_AT_BINDING,
  'components/engine/VoicesCard.tsx: lead': ALREADY_ISOLATED_AT_BINDING,
  'components/engine/chapterSyncText.ts: subject': APP_WORDING,
  'components/layout/AddressGate.tsx: reason': HOST_MESSAGE,
  'components/master/DiagnosticsSection.tsx: job.message': HOST_MESSAGE,
  'components/master/fileVerdict.ts: describeMiss(rule, result, owner)': APP_WORDING,
  'components/masterqc/page/MeasureRun.tsx: run.job.message': HOST_MESSAGE,
  'components/pickups/list/usePickupsContextMenu.ts: NO_NOTE': APP_CONSTANT,
  'components/production/ChapterTrackPanel.tsx: Noun': APP_WORDING,
  'components/proof/ProoferSheet.tsx: first': APP_WORDING,
  'components/recordingcheck/CheckRecordingsButton.tsx: caps.daw': DAW_NAME,
  'components/recordingcheck/activityView.ts: model': MODEL_LABEL,
  'components/recordingcheck/background/BackgroundChecksNotice.tsx: chapters': COUNT,
  'components/recordingcheck/runChoices.ts: first': MODEL_LABEL,
  'components/recordingcheck/runChoices.ts: how': HOST_MESSAGE,
  'components/recordingcheck/workerPlan.ts: lead': HOST_MESSAGE,
  'components/schedule/ContractPanel.tsx: text': COUNT,
  'components/schedule/dates.ts: t': COUNT,
  'components/settings/controls/EngineBody.tsx: daw': DAW_NAME,
  'components/settings/controls/EngineBody.tsx: option.daw': DAW_NAME,
  'components/settings/controls/EngineBody.tsx: foundFiles.length': COUNT,
  'components/settings/row/OpenLogFolderButton.tsx: FAILED': APP_CONSTANT,
  'daw/dawSession.ts: daw': DAW_NAME,
  'interactionFeedback/daw.ts: what': HOST_MESSAGE,
  'playback/providers.ts: caps.daw': DAW_NAME,
  'studio/drafts/draftSentence.ts: why': HOST_MESSAGE,
  "components/engine/LinkChaptersDialog.tsx: sharing.map(({ chapter }) => isolatedIfRtl(chapterName(chapter, 'short'))).join(', ')":
    ALREADY_ISOLATED_AT_BINDING,
  'components/booth/record/RecordSetup.tsx: guide.installFile': APP_WORDING,
  "components/booth/voices/WhoIsInDialog.tsx: keyName(String(ask.kind === 'key' ? ask.key : ''))": APP_WORDING,
  'components/delivery/page/chapterStates.ts: notReadyWhy(file)': APP_WORDING,
  'components/editing/cleanup/cleanupApply.ts: appliedLabel(kind, outcome.applied.length, params)': COUNT,
  'components/editing/ribbon/useRangeInteraction.ts: rangeLabel(span, wordsCovered(words, span).keys.length)': COUNT,
  'components/master/DeliveryProfilePanel.tsx: title': APP_WORDING,
  'components/master/DeliveryProfilePanel.tsx: profile.revision': COUNT,
  'components/master/MasteringChain.tsx: label': APP_WORDING,
  'components/master/fileVerdict.ts: rule.label': APP_WORDING,
  'components/recordingcheck/runChoices.ts: chunkLabel(choices.chunkSeconds)': APP_WORDING,
  "components/schedule/draft.ts: plural([...name].length, 'character')": COUNT,
  'components/settings/KeyboardPanel.tsx: gestureLabel(captured)': APP_WORDING,
  'components/settings/KeyboardPanel.tsx: conflictCommand.label': APP_WORDING,
  'components/settings/analysis/AnalysisToolsSection.tsx: removing.displayName': MODEL_LABEL,
  'components/settings/page/ModelsPane.tsx: removing.item.displayName': MODEL_LABEL,
  'components/stages/useStageRecommendations.ts: stageLabel(chapter.from)': APP_WORDING,
  'input/commandProviders.ts: command.label': APP_WORDING,
  'input/commandProviders.ts: clash.label': APP_WORDING,
  'playback/providers.ts: providers[0].name': DAW_NAME,
  'studio/journal/createJournal.ts: dawName()': DAW_NAME,
  'components/booth/ReadAlongView.tsx: t.prompt.model.displayName': MODEL_LABEL,
  'components/booth/WhisperModelPrompt.tsx: prompt.model.displayName': MODEL_LABEL,
  'components/booth/listening/ListeningModelPrompt.tsx: prompt.model.displayName': MODEL_LABEL,
  'components/booth/resume/resumeOfferModel.ts: result.model.displayName': MODEL_LABEL,
  'components/proof/CompareRun.tsx: whisperPrompt.model.displayName': MODEL_LABEL,
  'components/recordingcheck/CheckRecordingsDialog.tsx: ask.model.displayName': MODEL_LABEL,
  'components/recordingcheck/CheckRecordingsDialog.tsx: firstLabel': MODEL_LABEL,
  'components/recordingcheck/checkRun.ts: answer.model.displayName': MODEL_LABEL,
  'components/recordingcheck/workerPlan.ts: plan.modelLabel': MODEL_LABEL,
  'components/booth/record/recordCheck.ts: name': DAW_NAME,
  'components/booth/record/useRecordControl.ts: name': DAW_NAME,
  'components/editing/EditingPage.tsx: name': DAW_NAME,
  'components/editing/bar/useScriptPlayback.ts: name': DAW_NAME,
  'components/masterqc/page/MasterPage.tsx: name': DAW_NAME,
  'components/pickups/PickupsPage.tsx: name': DAW_NAME,
  'components/pickups/list/usePlayOriginal.ts: name': DAW_NAME,
  'components/production/ProductionPage.tsx: name': DAW_NAME,
  'components/proof/ProofPage.tsx: name': DAW_NAME,
  'playback/providers.ts: provider.name': DAW_NAME,
  'playback/providers.ts: capitalised(name)': DAW_NAME,
  'studio/dawNames.ts: name.charAt(0).toUpperCase()': DAW_NAME,
  'studio/dawNames.ts: name.slice(1)': DAW_NAME,
  "components/booth/record/useRecordControl.ts: otherProject ? 'has another project open' : 'is recording another track'": APP_WORDING,
  'components/editing/drawer/drawerSections.ts: section.label': APP_WORDING,
  'components/editing/range/common/locate.ts: name': APP_WORDING,
  'components/editing/takes/prep/usePrepSteps.tsx: STEP_TEXT[step].entry': APP_WORDING,
  'components/editing/takes/split/splitFixtures.ts: chapter': APP_WORDING,
  'components/master/ReportExportPanel.tsx: brand.identity.projectFolder': APP_WORDING,
  "components/masterqc/files/rows.ts: file.error ?? 'the file could not be read.'": APP_WORDING,
  "components/proof/inspector/FindingThread.tsx: message.who === 'you' ? 'your' : 'the proofer’s'": APP_WORDING,
  'components/script/page/rail/threads/NoteCard.tsx: message.who': APP_WORDING,
  'components/script/page/rail/threads/noteKeys.ts: message.who': APP_WORDING,
  'components/settings/DeliveryProfileEditor.tsx: profile.revision + 1': APP_WORDING,
  'components/settings/DeliveryProfilesPanel.tsx: profile.revision': APP_WORDING,
  'components/settings/ScopedSetting.tsx: field.label.toLowerCase()': APP_WORDING,
  'components/settings/UpdatesPanel.tsx: brand.name': APP_WORDING,
  'components/settings/page/ModelsPane.tsx: list(plan.blocked.map((row) => row.label))': APP_WORDING,
  'components/settings/page/ModelsPane.tsx: list(removingUses.map(settingLabel))': APP_WORDING,
  'components/storybible/propertyDraft.ts: field.label': APP_WORDING,
  'components/storybible/source/NamePronunciation.tsx: candidate.label': APP_WORDING,
  'components/storybible/source/NamePronunciation.tsx: source.label': APP_WORDING,
  "components/stages/useStageRecommendations.ts: previous.target ? stageLabel(previous.target) : 'the next stage'": APP_WORDING,
  'components/editing/page/noAudioText.ts: chapter': PAGE_TEXT_NOT_A_TOAST,
  'components/engine/destination.ts: chapter': PAGE_TEXT_NOT_A_TOAST,
  'components/stages/useStageRecommendations.ts: name': ALREADY_ISOLATED_AT_BINDING,
  'components/script/page/tools/find/useBookFind.ts: quoteTerm(term)': ALREADY_ISOLATED_AT_BINDING,
  "components/settings/UpdatesPanel.tsx: hasProject ? \" with the same project, and REAPER's launcher keeps working\" : ', at the project picker'": APP_WORDING,
  "studio/drafts/draftSentence.ts: held.length === 1 ? (/^\\d/.test(first.label) ? 'them' : 'it') : describeHeld(held)": APP_WORDING,
  'visibleText.ts: plainName(name)': THE_HELPER_ITSELF,
  'components/editing/bar/useScriptPlayback.ts: capitalised(name)': DAW_NAME,
  'components/booth/record/RecordSetup.tsx: name': DAW_NAME,
  'components/booth/record/takeWords.ts: name': DAW_NAME,
  'components/connection/ReaperOffDialog.tsx: name': DAW_NAME,
  'components/connection/useDawStatus.ts: name': DAW_NAME,
  'components/engine/AddMarkers.tsx: name': DAW_NAME,
  'components/engine/ShowInDaw.tsx: name': DAW_NAME,
  'studio/dawNames.ts: capitalised(name)': DAW_NAME,
  'studio/dawNames.ts: name': DAW_NAME,
  'components/engine/VoicesCard.tsx: name': ALREADY_ISOLATED_AT_BINDING,
  'components/connection/ChapterLinkDialog.tsx: createLabel': APP_WORDING,
  'components/delivery/profile/ProfileCard.tsx: rule.label': APP_WORDING,
  'components/layout/EngineChip.tsx: audacityTitle(forAudacity)': APP_WORDING,
  'components/master/MasteringApprovalDialog.tsx: plan.label': APP_WORDING,
  'components/recordingcheck/runChoices.ts: engine.label': APP_WORDING,
  'components/settings/ScopedSetting.tsx: choiceLabel(rowOfField(tool, field.key), value)': APP_WORDING,
  'components/settings/data/SettingsStore.tsx: row.label': APP_WORDING,
  'components/settings/models/AssetsStore.tsx: item.displayName': MODEL_LABEL,
  'components/settings/page/ModelsPane.tsx: name': MODEL_LABEL,
  'components/settings/page/ScopedFieldsPanel.tsx: field.label': APP_WORDING,
};

/**
 * The proof for each ALREADY_ISOLATED_AT_BINDING entry: the text, in the file named (the key's own file by default), that isolates the name where it is bound. The test fails when an
 * entry has none, or when the file no longer holds it, so removing the wrapper at the binding turns the guard red instead of leaving the entry to cover a bare name.
 */
/**
 * `pattern` is the wrapper and must be in the file; `forbid` is the bare form of the same name and must not be; `bind` is a variable that holds the isolated name, and every `const`/`let` of it in the
 * file must be an isolatedIfRtl(...) call, so one unwrapped site, or a new `const name = ...` beside the wrapped one, turns the guard red.
 */
type Proof = { pattern: RegExp; file?: string; forbid?: RegExp; bind?: string };
/** Every place that builds a journal label with a name in it: the label reaches a toast bare (the Undo toasts), so each producer isolates its name. */
const JOURNAL_LABELS: Proof[] = [
  { file: 'components/schedule/SchedulePage.tsx', pattern: /isolatedIfRtl\(m\.name\)/, forbid: /\$\{m\.name\}/ },
  { file: 'components/booth/record/takeCommand.ts', pattern: /Recorded a take of \$\{isolatedIfRtl\(title\)\}/, forbid: /\$\{title\}/ },
  {
    file: 'components/editing/voicesample/useVoiceSample.tsx',
    pattern: /Saved a voice sample for \$\{isolatedIfRtl\(name\)\}/,
    forbid: /voice sample for \$\{name\}/,
  },
  { file: 'components/editing/effects/EffectSettings.tsx', pattern: /\$\{isolatedIfRtl\(fx\.chainName\)\} with and without/, forbid: /\$\{fx\.chainName\}/ },
  { file: 'components/editing/range/fx/fxCommand.ts', pattern: /Took \$\{isolatedIfRtl\(fx\.chainName\)\} off/, forbid: /\$\{fx\.chainName\}/ },
  {
    file: 'components/storybible/GuideDetail.tsx',
    pattern: /Merged “\$\{isolatedIfRtl\(source\.canonical_name\)\}”/,
    forbid: /(?:Reviewed|Merged) “\$\{(?!isolatedIfRtl)/,
  },
  { file: 'components/storybible/GuideDetail.tsx', pattern: /Reviewed “\$\{isolatedIfRtl\(/ },
  { file: 'components/editing/takes/keepTake.ts', pattern: /Kept \$\{isolatedIfRtl\(take\.label\)\}/, forbid: /\$\{take\.label\}/ },
];
/** A call that isolates a file-like identifier first-strong, and why that is right. The key is `<file>: <argument>`. */
const FILE_NAMES_THAT_ARE_NOT: Record<string, string> = {};

const ISOLATED_AT: Record<string, Proof | Proof[]> = {
  'components/editing/page/useRereadFeedback.ts: name.slice(0, MAX_NAME - 1)': { pattern: /isolatedIfRtl\(nameIn\(/ },
  "App.tsx: newest?.label ?? 'the last change'": JOURNAL_LABELS,
  'components/engine/ChapterLinksTable.tsx: quoted(found.name, place)': { pattern: /isolatedIfRtl\(text\.length/ },
  'components/engine/ChapterLinksTable.tsx: who': { pattern: /const who = isolatedIfRtl\(short\)/, bind: 'who' },
  'components/engine/ChapterLinksTable.tsx: linked': { pattern: /const who = isolatedIfRtl\(short\)/ },
  "components/engine/chapterSyncText.ts: names.slice(0, -1).join(', ')": { pattern: /isolatedIfRtl\(readable\(candidate\.trackName/ },
  'components/engine/chapterSyncText.ts: names[0]': { pattern: /isolatedIfRtl\(readable\(candidate\.trackName/ },
  'components/engine/chapterSyncText.ts: names[names.length - 1]': { pattern: /isolatedIfRtl\(readable\(candidate\.trackName/ },
  'components/engine/chapterSyncText.ts: quotedList(item.candidates.map((candidate) => readable(candidate.trackName, candidate.trackIndex)))': {
    pattern: /`“\$\{isolatedIfRtl\(name\)\}”`/,
  },
  "components/storybible/voicesamples/useVoiceSampleActions.tsx: [sampleLength(sample.durationMs), isolatedIfRtl(sample.source.chapterTitle)].filter(Boolean).join(', ')":
    { pattern: /isolatedIfRtl\(sample\.source\.chapterTitle\)/ },
  'studio/journal/createJournal.ts: blocker.label': JOURNAL_LABELS,
  'studio/journal/createJournal.ts: newest.label': JOURNAL_LABELS,
  "components/engine/NestedChaptersNotice.tsx: folders.map(folderOf).join(' and ')": { pattern: /isolatedIfRtl\(short\(name\.trim\(\)\)\)/ },
  "components/engine/NestedChaptersNotice.tsx: shownFolders.join(' and ')": { pattern: /isolatedIfRtl\(short\(move\.fromName\)\)/ },
  'components/engine/useChapterFolders.ts: folders': { pattern: /isolatedIfRtl\(move\.fromName\)/ },
  'components/stages/useStageRecommendations.ts: name': { pattern: /const name = isolatedIfRtl\(/, bind: 'name' },
  'components/script/page/tools/find/useBookFind.ts: quoteTerm(term)': {
    file: 'components/script/page/tools/find/findState.ts',
    pattern: /isolatedIfRtl\(term/,
  },
  'components/engine/VoicesCard.tsx: name': { pattern: /const name = isolatedIfRtl\(/, bind: 'name' },
  'components/engine/VoicesCard.tsx: lead': { pattern: /const name = isolatedIfRtl\(/ },
  "components/engine/LinkChaptersDialog.tsx: sharing.map(({ chapter }) => isolatedIfRtl(chapterName(chapter, 'short'))).join(', ')": {
    pattern: /isolatedIfRtl\(chapterName\(chapter, 'short'\)\)/,
  },
  'components/engine/NestedChaptersNotice.tsx: who': { pattern: /isolatedIfRtl\(short\(trackName\(move\.trackName\)\)\)/ },
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
  const all: Tree = { hits: [], seen: [], inspected: 0, leading: [], auto: [], everything: new Set() };
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
    all.auto.push(...result.auto.filter((key) => !(key in FILE_NAMES_THAT_ARE_NOT)));
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

  it('keeps a proof of the wrapper for every entry that is isolated where it is bound, and the proof is still in the file', () => {
    const bound = Object.entries({ ...APP_DEFINED, ...LEADS_NOT_A_NARRATOR_NAME })
      .filter(([, reason]) => reason === ALREADY_ISOLATED_AT_BINDING)
      .map(([key]) => key);
    expect(bound.filter((key) => !(key in ISOLATED_AT)).map((key) => `${key} has no proof in ISOLATED_AT`)).toEqual([]);
    expect(
      Object.keys(ISOLATED_AT)
        .filter((key) => !bound.includes(key))
        .map((key) => `${key} has a proof but is not allowed as ALREADY_ISOLATED_AT_BINDING`),
    ).toEqual([]);
    const read = (key: string, proof: Proof) => readFileSync(join(SRC, proof.file ?? key.slice(0, key.indexOf(': '))), 'utf8');
    const unbound = (source: string, name: string) =>
      source.split('\n').filter((line) => new RegExp(`\\b(?:const|let) ${name}\\b`).test(line) && !line.includes('isolatedIfRtl('));
    const missing = Object.entries(ISOLATED_AT)
      .flatMap(([key, proofs]) => [proofs].flat().map((proof) => ({ key, proof })))
      .flatMap(({ key, proof }) => {
        const source = read(key, proof);
        return [
          ...(proof.pattern.test(source) ? [] : [`${key}: the wrapper it relies on is gone (${proof.pattern})`]),
          ...(proof.forbid?.test(source) ? [`${key}: a bare name came back (${proof.forbid})`] : []),
          ...(proof.bind ? unbound(source, proof.bind).map((line) => `${key}: \`${proof.bind}\` is bound without isolatedIfRtl: ${line.trim()}`) : []),
        ];
      });
    expect(missing).toEqual([]);
  });

  it('isolates a file name or a path left to right, so an Arabic name.rpp keeps its extension last', () => {
    expect(tree.auto.map((key) => `${key} is isolated first-strong: pass 'ltr'`)).toEqual([]);
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

  it('reads a plural name, an input name and a sentence that ends in a space', () => {
    expect(scanSource('x.ts', "const s = `Joined ${names.join(', ')} and more. `;").leading).toEqual(["x.ts: names.join(', ')"]);
    expect(scanSource('x.ts', 'const s = `${dawName} records from ${mic.dawInput}.`;').leading).toContain('x.ts: mic.dawInput');
    expect(scanSource('x.ts', 'const s = `Linked to ${linkedFile}. `;').leading).toEqual(['x.ts: linkedFile']);
  });

  it('does not take a joined list wrapped as one unit for isolated names', () => {
    expect(hits("notify(`${isolatedIfRtl(names.join(', '))} removed.`);")).toHaveLength(1);
  });

  it('flags a file name or a path isolated first-strong, and not one isolated ltr or a name that is not a file', () => {
    const auto = (source: string) => scanSource('x.ts', source).auto;
    expect(auto('const s = `${isolatedIfRtl(linkedFile)} is linked.`;')).toEqual(['x.ts: linkedFile']);
    expect(auto('const s = `${isolatedIfRtl(foundFiles[0])} is here.`;')).toEqual(['x.ts: foundFiles[0]']);
    expect(auto("const s = `${isolatedIfRtl(linkedFile, 'ltr')} is linked.`;")).toEqual([]);
    expect(auto('const s = `${isolatedIfRtl(chapter.title)} is linked.`;')).toEqual([]);
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
