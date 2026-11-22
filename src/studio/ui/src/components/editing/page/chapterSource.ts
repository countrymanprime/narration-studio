import type { ChapterLinkState } from '../../chapterTracks/chapterLink';
import type { EditCut } from '../../../api/contracts/editCuts';
import type { TrackItem } from '../../../api/contracts/tracks';
import type { WordFx } from '../../../api/contracts/wordFx';
import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import { HEADING_PARAGRAPH, tokenParagraph, type HeardAnswer, type HeardWord } from '../../../ports/alignment';
import type { PlaylistSegment } from '../../proof/playlist';
import { curTime, type ChapterDoc, type DocItem, type HeardWord as ModelWord } from '../model';
import { duplicateRead } from '../model/duplicates';
import { itemClocks, type ItemClocks } from '../ribbon/docClock';
import type { RangeLocator } from '../range/common/locate';
import { docCutsOf } from '../range/common/locate';
import { docFromHeard, groupByParagraph, LEAD, type QuotedPhrase } from '../script/docFromHeard';

/** Where a paragraph's audio is: the item it was heard on and its heard words. */
interface HeardSpan {
  item: number;
  words: readonly HeardWord[];
}

/** Seconds of the item's source where a stretch begins: its first heard word less the lead-in. */
const originOf = (span: HeardSpan): number => span.words[0].off0 - LEAD;

/** The heard words by paragraph, as `docFromHeard` groups them (`groupByParagraph`). */
function heardSpans(answer: HeardAnswer, firstParagraph: string | undefined): Map<string, HeardSpan> {
  const out = new Map<string, HeardSpan>();
  if (!answer.heard) return out;
  for (const [pid, words] of groupByParagraph(answer.heard.words, firstParagraph)) out.set(pid, { item: words[0].item, words });
  return out;
}

/**
 * The shift of the document clock against an item's source at a moment of the document (`source = document - shift`): the one clock the waveform is
 * drawn on (`itemClocks`), so a cut, a play and the waveform all put a word at the same second. Null only for an item no word is placed on.
 */
const sourceShift = (clocks: ItemClocks, item: number, at: number): number | null => {
  const pieces = clocks.get(item) ?? [];
  // The piece that began last by `at`: at the join of two pieces (the word after a closed cut) that is the later one, and in a pause between a piece's
  // words and the next piece the earlier one still holds.
  return (pieces.filter((p) => at >= p.from - 1e-9).at(-1) ?? pieces[0])?.shift ?? null;
};

/**
 * Whether the chapter has audio the page can edit. When it has none, why: no track is linked to it (`unlinked`), the linked track is not in the
 * saved project (`missing`), or the track holds nothing (`empty`). `unsaved` is on an `empty` chapter when the DAW has changes its saved file lacks (`'unknown'` when it could not say, so the page does not tell the narrator to record again), and `missing` when the link's track is not in the saved project: the page
 * reads the saved project only, so a take recorded since the last save is not there yet and the way forward is to save, not to record.
 */
export type ChapterAudio =
  | { kind: 'ready' }
  | { kind: 'unlinked' | 'missing' }
  | { kind: 'empty'; folder?: boolean; unsaved?: boolean | 'unknown'; missing?: boolean }
  // The tracks could not be read, so nothing says whether there is audio: `reason` is the shared sentence (`tracksUnreadable`).
  | { kind: 'unreadable'; reason: string };

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
export function audioOf(
  link: ChapterLinkState | 'unknown',
  trackItems: number,
  liveItems: number,
  folder = false,
  unsaved: boolean | 'unknown' = false,
  unreadable: string | null = null,
): ChapterAudio {
  // A project that could not be read says nothing about the link, but a page with nothing that proves audio exists must say why it plays nothing.
  if (link === 'unknown' && unreadable !== null && trackItems === 0 && liveItems === 0) return { kind: 'unreadable', reason: unreadable };
  if (link === 'unknown' || trackItems > 0 || liveItems > 0) return { kind: 'ready' };
  // A linked track the saved project lacks may be one added since the last save: with unsaved changes that is a save to make, not a link to fix.
  // A chapter with several links plays its first track, as it did before the one vocabulary: it is `linked` here.
  const linked = link === 'linked' || link === 'several';
  if (unsaved && (linked || link === 'missing'))
    return { kind: 'empty', ...(folder ? { folder } : {}), unsaved, ...(link === 'missing' ? { missing: true } : {}) };
  return linked ? { kind: 'empty', ...(folder ? { folder } : {}) } : { kind: link };
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
  const guids = new Map(read.workspace.items.map((it) => [it.index, it.itemGuid]));
  const clocks = itemClocks(doc);
  return {
    token: (key) => tokens.get(key),
    source(at) {
      const dp = paraOf(doc, at);
      // The item is the one of the word sounding at `at` (a line can run across items).
      const word = dp?.items.filter((i) => i.src && i.t0 != null && !i.cut && i.st !== 'miss' && i.t0 <= at + 1e-9).at(-1) ?? dp?.items.find((i) => i.src);
      const item = word?.src?.item;
      const itemGuid = item === undefined ? undefined : guids.get(item);
      if (item === undefined || !itemGuid) return null;
      const shift = sourceShift(clocks, item, at);
      return shift == null ? null : { itemGuid, sourceTime: at - shift };
    },
    place: () => read.place,
  };
}

/**
 * The files the bar plays, on the document's clock: one segment for each heard paragraph, from where it begins now to where it ends, over the
 * stretch of its item's source it was heard in. A paragraph whose item the saved project no longer has, or whose file is missing, plays nothing.
 */
export function playlistOf(doc: ChapterDoc, read: ChapterRead): PlaylistSegment[] {
  const guids = new Map(read.workspace.items.map((it) => [it.index, it.itemGuid]));
  const files = new Map(read.items.filter((i) => i.supported && i.sourceAvailable).map((i) => [i.guid, i.sourceFile]));
  const clocks = itemClocks(doc);
  const allCuts = docCutsOf(read.cuts);
  const gapCuts = allCuts.filter((c) => c.mode === 'gap').map((c) => ({ a: curTime(allCuts, c.a), b: curTime(allCuts, c.b) }));
  const out: PlaylistSegment[] = [];
  for (const dp of doc.paras) {
    // A line can run across items: each item's words play from its own file, on its own clock.
    for (const item of new Set(dp.items.flatMap((i) => (i.src ? [i.src.item] : [])))) {
      const itemGuid = guids.get(item);
      const sourceFile = itemGuid ? files.get(itemGuid) : undefined;
      if (!itemGuid || !sourceFile) continue;
      for (const piece of clocks.get(item) ?? []) {
        // The play runs over the words the piece holds, from the first one's start to the last one's end: the piece itself runs a tail past its last word
        // for the waveform, and a word that was cut sits inside that tail.
        const audible = dp.items.filter((i) => i.src && i.t0 != null && i.t1 != null && !i.cut && i.st !== 'miss');
        const inPiece = audible.filter((i) => i.src?.item === item && (i.t0 as number) >= piece.from - 1e-9 && (i.t0 as number) < piece.to - 1e-9);
        // A line that goes to another item and back plays this one twice: words of another item between two of these split them.
        const runs: DocItem[][] = [];
        for (const i of inPiece) {
          const last = runs.at(-1);
          const between = last ? audible.slice(audible.indexOf(last[last.length - 1]) + 1, audible.indexOf(i)) : [];
          if (last && !between.some((x) => x.src?.item !== item)) last.push(i);
          else runs.push([i]);
        }
        for (const held of runs) {
          const first = Math.min(...held.map((i) => i.t0 as number));
          const last = Math.max(...held.map((i) => i.t1 as number));
          // A cut that leaves a gap keeps the time and not the sound: the play steps over it.
          let spans: Array<[number, number]> = [[first, last]];
          for (const c of gapCuts)
            spans = spans.flatMap(([a, b]) =>
              c.b <= a || c.a >= b
                ? [[a, b]]
                : (
                    [
                      [a, Math.min(b, c.a)],
                      [Math.max(a, c.b), b],
                    ] as Array<[number, number]>
                  ).filter(([x, y]) => y - x > 1e-9),
            );
          for (const [from, to] of spans) {
            if (to - from <= 1e-9) continue;
            out.push({
              itemGuid,
              sourceFile,
              sourceStart: from - piece.shift,
              sourceEnd: to - piece.shift,
              elapsedStart: from,
              elapsedEnd: to,
              overlapsPrevious: false,
            });
          }
        }
      }
    }
  }
  // One line can run across items and back: the play steps through the document in order.
  return out.sort((a, b) => a.elapsedStart - b.elapsedStart);
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
  const origin = originOf(span);
  const words: ModelWord[] = span.words.map((w) => ({ text: w.text, off0: w.off0 - origin, off1: w.off1 - origin, conf: w.conf ?? 1 }));
  const repeated = repeatSplit(span.words, words);
  if (repeated !== undefined) return repeated;
  const dup = duplicateRead(para.text, words);
  return dup ? { startsAt: dup.startsAt, cutAt: dup.cutAt } : null;
}

/**
 * The moment of the document at which `sourceTime` of the paragraph's item sounds, on the same clock the waveform and the play use: the piece of the item
 * (a closed cut makes more than one) that holds the moment there. Null when no word of the paragraph is placed.
 */
export function docTimeOf(doc: ChapterDoc, read: ChapterRead, paragraphId: string, sourceTime: number): number | null {
  const para = doc.paras.find((p) => p.p.id === paragraphId);
  // The item is the one `stretchOrigin` counts from: the first word heard in the paragraph, and only the pieces its words sit in are its own.
  const item = heardSpans(read.answer, read.workspace.paragraphs[0]?.id).get(paragraphId)?.item;
  if (!para || item === undefined) return null;
  const mine = para.items.filter((i) => i.src?.item === item && i.t0 != null && !i.cut && i.st !== 'miss');
  const pieces = (itemClocks(doc).get(item) ?? []).filter((p) => mine.some((i) => (i.t0 as number) >= p.from - 1e-9 && (i.t0 as number) < p.to - 1e-9));
  const hit = pieces.filter((p) => sourceTime + p.shift >= p.from - 1e-9).at(-1) ?? pieces[0];
  return hit ? sourceTime + hit.shift : null;
}

/** Seconds of the item's source where a paragraph's stretch begins: its first heard word less the lead-in, the zero `doubledCut` and `doubledStart` count from. Null when nothing was heard in it. */
export function stretchOrigin(read: ChapterRead, paragraphId: string): number | null {
  const span = heardSpans(read.answer, read.workspace.paragraphs[0]?.id).get(paragraphId);
  return span ? originOf(span) : null;
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
