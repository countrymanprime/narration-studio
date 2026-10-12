import type { EditCut } from '../../../api/contracts/editCuts';
import type { TrackItem } from '../../../api/contracts/tracks';
import type { WordFx } from '../../../api/contracts/wordFx';
import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import type { HeardAnswer, HeardWord } from '../../../ports/alignment';
import type { PlaylistSegment } from '../../proof/playlist';
import type { ChapterDoc, HeardWord as ModelWord } from '../model';
import { duplicateRead } from '../model/duplicates';
import type { RangeLocator } from '../range/common/locate';
import { docCutsOf } from '../range/common/locate';
import { docFromHeard } from '../script/docFromHeard';

/** Seconds of lead-in `docFromHeard` puts before a paragraph's first heard word. */
const LEAD = 0.15;

/** Where a paragraph's audio is: the item it was heard on and the second of that item's source the paragraph's time 0 is. */
interface HeardSpan {
  item: number;
  origin: number;
  words: readonly HeardWord[];
}

/** The heard words by paragraph, as `docFromHeard` groups them: a word said and not in the script goes with the script word before it. */
function heardSpans(answer: HeardAnswer, firstParagraph: string | undefined): Map<string, HeardSpan> {
  const out = new Map<string, HeardSpan>();
  if (!answer.heard) return out;
  let current = firstParagraph;
  for (const w of answer.heard.words) {
    if (w.paragraphId !== undefined) current = w.paragraphId;
    if (current === undefined) continue;
    const span = out.get(current);
    if (span) out.set(current, { ...span, words: [...span.words, w] });
    else out.set(current, { item: w.item, origin: w.off0 - LEAD, words: [w] });
  }
  return out;
}

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
}

/** The chapter's document with its cuts, effects and accepted words. */
export function docOf(read: ChapterRead): ChapterDoc {
  return docFromHeard(read.workspace.paragraphs, read.answer, {
    cuts: docCutsOf(read.cuts),
    effects: read.effects.filter((e) => !e.stale).map((e) => ({ id: e.id, keys: [...e.keys] })),
    accepted: read.accepted,
  });
}

const paraOf = (doc: ChapterDoc, at: number) => doc.paras.find((p) => p.start != null && p.end != null && at >= p.start && at <= p.end) ?? null;

/** Where the page's words are for the DAW: script words by their alignment token, moments by the item they were heard on. */
export function locatorOf(doc: ChapterDoc, read: ChapterRead): RangeLocator {
  const tokens = new Map(read.workspace.tokens.filter((t) => t.p !== undefined).map((t) => [`${t.p}:${t.w}`, t.i]));
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

/** The chapter's length now: where its last heard word ends. */
export const lengthOf = (doc: ChapterDoc): number => doc.items.reduce((a, i) => (i.t1 != null && !i.cut ? Math.max(a, i.t1) : a), 0);

/** Where a doubled read of a paragraph is cut, in seconds from the start of its take, or null when the paragraph is not read twice. */
export function doubledCut(read: ChapterRead, paragraphId: string): number | null {
  const para = read.workspace.paragraphs.find((p) => p.id === paragraphId);
  const span = heardSpans(read.answer, read.workspace.paragraphs[0]?.id).get(paragraphId);
  if (!para || !span) return null;
  const words: ModelWord[] = span.words.map((w) => ({ text: w.text, off0: w.off0 - span.origin, off1: w.off1 - span.origin, conf: w.conf ?? 1 }));
  return duplicateRead(para.text, words)?.cutAt ?? null;
}

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
