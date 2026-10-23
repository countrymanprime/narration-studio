import type { EditCut } from '../../../api/contracts/editCuts';
import type { TrackItem } from '../../../api/contracts/tracks';
import type { WordFx } from '../../../api/contracts/wordFx';
import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import { HEADING_PARAGRAPH, tokenParagraph, type HeardAnswer, type HeardWord } from '../../../ports/alignment';
import type { PlaylistSegment } from '../../proof/playlist';
import type { ChapterDoc, HeardWord as ModelWord } from '../model';
import type { DocCut } from '../model/cuts';
import type { ClosedCut } from '../follow/clockMap';
import { duplicateRead } from '../model/duplicates';
import type { RangeLocator } from '../range/common/locate';
import { docCutsOf } from '../range/common/locate';
import { docFromHeard, groupByParagraph, type QuotedPhrase } from '../script/docFromHeard';

/** Seconds of lead-in `docFromHeard` puts before a paragraph's first heard word. */
const LEAD = 0.15;

/** Where a paragraph's audio is: the item it was heard on and the second of that item's source the paragraph's time 0 is. */
interface HeardSpan {
  item: number;
  origin: number;
  words: readonly HeardWord[];
}

/** The heard words by paragraph, as `docFromHeard` groups them (`groupByParagraph`). */
function heardSpans(answer: HeardAnswer, firstParagraph: string | undefined): Map<string, HeardSpan> {
  const out = new Map<string, HeardSpan>();
  if (!answer.heard) return out;
  for (const [pid, words] of groupByParagraph(answer.heard.words, firstParagraph)) out.set(pid, { item: words[0].item, origin: words[0].off0 - LEAD, words });
  return out;
}

/**
 * Whether the chapter has audio the page can edit. When it has none, why: no track is linked to it (`unlinked`), the linked track is not in the
 * saved project (`missing`), or the track holds nothing (`empty`).
 */
export type ChapterAudio = { kind: 'ready' } | { kind: 'unlinked' | 'missing' | 'empty' };

/** Everything the page reads for one chapter, as the ports answered. */
export interface ChapterRead {
  workspace: WorkspaceAlignmentResult;
  answer: HeardAnswer;
  cuts: EditCut[];
  effects: WordFx[];
  accepted: string[];
  /** The chapter's track items from the saved project; empty when the chapter has no linked track. */
  items: TrackItem[];
  /** What the DAW calls where the chapter's audio is (`track “Chapter 1”`), or the chapter's own name. */
  place: string;
  /** Whether there is audio to edit. Without it the document is the plain script: a word cannot be "not read" in a recording that is not there. */
  audio: ChapterAudio;
}

const NO_AUDIO_REASON = 'There is no audio for this chapter.';

/**
 * The chapter's audio from its link: audio exists when its linked track holds items or the alignment names an item the saved project still has
 * (`live`; the built-in recorder has no track to link). With neither, the link says why. `unknown` is a project that could not be read, which says
 * nothing about the link, so the page does not claim there is no audio.
 */
export function audioOf(link: 'linked' | 'unlinked' | 'missing' | 'unknown', trackItems: number, liveItems: number): ChapterAudio {
  if (link === 'unknown' || trackItems > 0 || liveItems > 0) return { kind: 'ready' };
  return { kind: link === 'linked' ? 'empty' : link };
}

/**
 * The text the page sets against what was heard: the chapter's heading first, the title and subtitle a narrator reads aloud (so saying them is
 * not saying extra words, and not saying them is not a word missed), then the paragraphs. A credits row has no heading.
 */
function scriptOf(
  workspace: WorkspaceAlignmentResult,
  phrasesOf: (paragraphId: string) => readonly QuotedPhrase[],
): Array<{ id: string; text: string; phrases?: readonly QuotedPhrase[] }> {
  const heading = [workspace.title, workspace.subtitle].filter(Boolean).join('. ');
  const paragraphs = workspace.paragraphs.map((p) => ({ id: p.id, text: p.text, phrases: phrasesOf(p.id) }));
  return heading ? [{ id: HEADING_PARAGRAPH, text: heading }, ...paragraphs] : paragraphs;
}

/** The chapter's document with its cuts, effects and accepted words. */
export function docOf(read: ChapterRead, phrasesOf: (paragraphId: string) => readonly QuotedPhrase[] = () => []): ChapterDoc {
  const answer: HeardAnswer = read.audio.kind === 'ready' ? read.answer : { heard: null, reason: NO_AUDIO_REASON, reasons: [] };
  return docFromHeard(scriptOf(read.workspace, phrasesOf), answer, {
    cuts: docCutsOf(read.cuts),
    effects: read.effects.filter((e) => !e.stale).map((e) => ({ id: e.id, keys: [...e.keys] })),
    accepted: read.accepted,
  });
}

const paraOf = (doc: ChapterDoc, at: number) => doc.paras.find((p) => p.start != null && p.end != null && at >= p.start && at <= p.end) ?? null;

/** Where the page's words are for the DAW: script words by their alignment token, moments by the item they were heard on. */
export function locatorOf(doc: ChapterDoc, read: ChapterRead): RangeLocator {
  const tokens = new Map(read.workspace.tokens.filter((t) => tokenParagraph(t) !== undefined).map((t) => [`${tokenParagraph(t)}:${t.w}`, t.i]));
  const spans = heardSpans(read.answer, read.workspace.paragraphs[0]?.id);
  const guids = new Map(read.workspace.items.map((it) => [it.index, it.itemGuid]));
  return {
    token: (key) => tokens.get(key),
    source(at) {
      const dp = paraOf(doc, at);
      const span = dp ? spans.get(dp.p.id) : undefined;
      const itemGuid = span ? guids.get(span.item) : undefined;
      if (!dp || dp.start == null || !span || !itemGuid) return null;
      return { itemGuid, sourceTime: span.origin + (at - dp.start) };
    },
    place: () => read.place,
  };
}

/**
 * The files the bar plays, on the document's clock: one segment for each heard paragraph, from where it begins now to where it ends, over the
 * stretch of its item's source it was heard in. A paragraph whose item the saved project no longer has, or whose file is missing, plays nothing.
 */
export function playlistOf(doc: ChapterDoc, read: ChapterRead): PlaylistSegment[] {
  const spans = heardSpans(read.answer, read.workspace.paragraphs[0]?.id);
  const guids = new Map(read.workspace.items.map((it) => [it.index, it.itemGuid]));
  const files = new Map(read.items.filter((i) => i.supported && i.sourceAvailable).map((i) => [i.guid, i.sourceFile]));
  const out: PlaylistSegment[] = [];
  for (const dp of doc.paras) {
    const span = spans.get(dp.p.id);
    const itemGuid = span ? guids.get(span.item) : undefined;
    const sourceFile = itemGuid ? files.get(itemGuid) : undefined;
    if (dp.start == null || dp.end == null || !span || !itemGuid || !sourceFile) continue;
    const len = dp.end - dp.start;
    out.push({
      itemGuid,
      sourceFile,
      sourceStart: span.origin,
      sourceEnd: span.origin + len,
      elapsedStart: dp.start,
      elapsedEnd: dp.end,
      overlapsPrevious: false,
    });
  }
  return out;
}

/**
 * The closing cuts the clock map takes out of the project, in the source seconds of the item their paragraph was heard on. `places` says, for each
 * paragraph, the item it was heard on and the source second its time 0 is. Only a cut that took words out and closed its gap counts: a gap cut
 * moves nothing, a wordless cut (a trimmed gap) belongs to no paragraph, and a cut inside a take is placed from the take's start, which the page's
 * playlist does not keep, so it is left out and the words after it have no project time (docs/design/editing-daw-transport-sync.md).
 */
export function closedCutsFrom(cuts: readonly DocCut[], places: ReadonlyMap<string, { itemGuid: string; origin: number }>): ClosedCut[] {
  const out: ClosedCut[] = [];
  for (const cut of cuts) {
    if (cut.mode !== 'close' || cut.takeId || !cut.keys.length) continue;
    const key = cut.keys[0];
    const place = places.get(key.slice(0, key.lastIndexOf(':')));
    if (place && cut.off1 > cut.off0) out.push({ itemGuid: place.itemGuid, from: place.origin + cut.off0, to: place.origin + cut.off1 });
  }
  return out;
}

/** The chapter's closing cuts for the clock map (`closedCutsFrom`), from what the page read. */
export function closedCutsOf(read: ChapterRead): ClosedCut[] {
  const spans = heardSpans(read.answer, read.workspace.paragraphs[0]?.id);
  const guids = new Map(read.workspace.items.map((it) => [it.index, it.itemGuid]));
  const places = new Map<string, { itemGuid: string; origin: number }>();
  for (const [pid, span] of spans) {
    const itemGuid = guids.get(span.item);
    if (itemGuid) places.set(pid, { itemGuid, origin: span.origin });
  }
  return closedCutsFrom(docCutsOf(read.cuts), places);
}

/** The chapter's length now: where its last heard word ends. */
export const lengthOf = (doc: ChapterDoc): number => doc.items.reduce((a, i) => (i.t1 != null && !i.cut ? Math.max(a, i.t1) : a), 0);

/**
 * Where a run the recording check found says the line again splits the line into two reads (issue #2251 item 30): a retake (it repeats the
 * words before it) is cut before the run, so an aside said first goes with the second read; a restart (it repeats the words after it) is cut
 * after the run. Undefined when the paragraph has no such run, null when the run has no word on the far side to cut against.
 */
function repeatSplit(heard: readonly HeardWord[], words: readonly ModelWord[]): { startsAt: number; cutAt: number } | null | undefined {
  const first = heard.findIndex((w) => w.repeats !== undefined);
  if (first < 0) return undefined;
  let last = first;
  while (last + 1 < heard.length && heard[last + 1].repeats === heard[first].repeats) last++;
  const [before, after] = heard[first].repeats === 'previous' ? [first - 1, first] : [last, last + 1];
  if (before < 0 || after >= words.length) return null;
  return { startsAt: words[after].off0, cutAt: Math.round(((words[before].off1 + words[after].off0) / 2) * 1000) / 1000 };
}

/** How a take that reads its paragraph twice splits: where the second read starts and where to cut, in seconds from the start of the take. Null when it reads the paragraph once. */
function doubledRead(read: ChapterRead, paragraphId: string): { startsAt: number; cutAt: number } | null {
  const para = read.workspace.paragraphs.find((p) => p.id === paragraphId);
  const span = heardSpans(read.answer, read.workspace.paragraphs[0]?.id).get(paragraphId);
  if (!para || !span) return null;
  const words: ModelWord[] = span.words.map((w) => ({ text: w.text, off0: w.off0 - span.origin, off1: w.off1 - span.origin, conf: w.conf ?? 1 }));
  const repeated = repeatSplit(span.words, words);
  if (repeated !== undefined) return repeated;
  const dup = duplicateRead(para.text, words);
  return dup ? { startsAt: dup.startsAt, cutAt: dup.cutAt } : null;
}

/** Where a doubled read of a paragraph is cut, in seconds from the start of its take, or null when the paragraph is not read twice. */
export const doubledCut = (read: ChapterRead, paragraphId: string): number | null => doubledRead(read, paragraphId)?.cutAt ?? null;

/** Where the second read of a doubled paragraph starts, in seconds from the start of its take, or null when the paragraph is not read twice. */
export const doubledStart = (read: ChapterRead, paragraphId: string): number | null => doubledRead(read, paragraphId)?.startsAt ?? null;

/** The script word at a moment of the chapter (the last one begun by then), or null when nothing is heard there. */
export function wordAt(doc: ChapterDoc, t: number): string | null {
  let key: string | null = null;
  for (const it of doc.items) {
    if (it.t0 == null || it.cut || it.kind !== 'w') continue;
    if (it.t0 > t + 1e-6) break;
    key = it.key;
  }
  return key;
}
