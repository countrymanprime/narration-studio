import type { WorkspaceItem } from '../../../api/contracts/workspace';
import type { PlaylistSegment } from '../../proof/playlist';
import { docAt } from './clockMap';

/**
 * A synthetic chapter and a way to score the follow-along against it: the word the page lights at a project second against the word being spoken
 * there. Used by followError.test.ts; nothing here ships.
 */

export interface Piece {
  guid: string;
  position: number;
  sourceStart: number;
  length: number;
  rate: number;
}

export interface Sentence {
  index: number;
  start: number;
  end: number;
}

const PARAGRAPHS = 12;
const SENTENCES_PER_PARAGRAPH = 3;
const SENTENCE_SECONDS = 2.25;
const SENTENCE_GAP = 0.3;
const PARAGRAPH_GAP = 1;
const FILE = 'chapter.wav';

/** Source seconds of every sentence of the recording, and the paragraphs' source stretches. */
export function recording(): { sentences: Sentence[]; paragraphs: Array<{ start: number; end: number }>; length: number } {
  const sentences: Sentence[] = [];
  const paragraphs: Array<{ start: number; end: number }> = [];
  let t = 0.5;
  for (let p = 0; p < PARAGRAPHS; p++) {
    const start = t;
    for (let s = 0; s < SENTENCES_PER_PARAGRAPH; s++) {
      sentences.push({ index: sentences.length, start: t, end: t + SENTENCE_SECONDS });
      t += SENTENCE_SECONDS + (s < SENTENCES_PER_PARAGRAPH - 1 ? SENTENCE_GAP : 0);
    }
    paragraphs.push({ start, end: t });
    t += PARAGRAPH_GAP;
  }
  return { sentences, paragraphs, length: t };
}

/** The playlist the page builds: one segment per paragraph, laid end to end on the document's clock, each over the item that was analysed. */
export function playlistFor(itemGuid: string): PlaylistSegment[] {
  let elapsed = 0;
  return recording().paragraphs.map((p) => {
    const seg = {
      itemGuid,
      sourceFile: FILE,
      sourceStart: p.start,
      sourceEnd: p.end,
      elapsedStart: elapsed,
      elapsedEnd: elapsed + p.end - p.start,
      overlapsPrevious: false,
    };
    elapsed = seg.elapsedEnd;
    return seg;
  });
}

export const FILE_NAME = FILE;

export const asItem = (p: Piece, index = 0, live = true): WorkspaceItem => ({
  index,
  itemGuid: p.guid,
  live,
  position: p.position,
  sourceStart: p.sourceStart,
  length: p.length,
  playRate: p.rate,
});

/** The source second the DAW plays at project second `t`, or null where nothing plays. */
export function truthSource(pieces: readonly Piece[], t: number): number | null {
  let hit: Piece | null = null;
  for (const p of pieces) if (t >= p.position && t < p.position + p.length && (!hit || p.position >= hit.position)) hit = p;
  return hit ? hit.sourceStart + (t - hit.position) * hit.rate : null;
}

export interface Score {
  samples: number;
  /** Samples where the page lit nothing though speech is playing (silence between sentences is not counted). */
  unlit: number;
  /** Samples where the page lit a different sentence than the one spoken. */
  wrongSentence: number;
  /** The largest number of sentences the page was off by. */
  maxSentencesOff: number;
  medianMs: number;
  maxMs: number;
}

const sentenceAt = (sentences: readonly Sentence[], source: number): number | null => sentences.find((s) => source >= s.start && source < s.end)?.index ?? null;

/**
 * Plays the project from its start to its end in 100 ms steps and compares, at each step, the source second the page's clock map says is playing
 * with the one the DAW really plays. `map` is what the page knows (playlist and items); `actual` is what the DAW has.
 */
export function score(map: { playlist: readonly PlaylistSegment[]; items: readonly WorkspaceItem[] }, actual: readonly Piece[]): Score {
  const { sentences } = recording();
  const end = Math.max(...actual.map((p) => p.position + p.length));
  const errors: number[] = [];
  let samples = 0;
  let unlit = 0;
  let wrong = 0;
  let maxOff = 0;
  for (let t = 0; t < end; t += 0.1) {
    const truth = truthSource(actual, t);
    if (truth === null) continue;
    const spoken = sentenceAt(sentences, truth);
    if (spoken === null) continue;
    samples++;
    const doc = docAt({ playlist: map.playlist, items: map.items }, t);
    const seg = doc === null ? undefined : map.playlist.find((s) => doc >= s.elapsedStart && doc < s.elapsedEnd);
    if (doc === null || !seg) {
      unlit++;
      continue;
    }
    const claimed = seg.sourceStart + (doc - seg.elapsedStart);
    errors.push(Math.abs(claimed - truth) * 1000);
    const lit = sentenceAt(sentences, claimed);
    if (lit !== spoken) {
      wrong++;
      maxOff = Math.max(maxOff, lit === null ? 1 : Math.abs(lit - spoken));
    }
  }
  errors.sort((a, b) => a - b);
  return {
    samples,
    unlit,
    wrongSentence: wrong,
    maxSentencesOff: maxOff,
    medianMs: errors.length ? Math.round(errors[Math.floor(errors.length / 2)]) : 0,
    maxMs: errors.length ? Math.round(errors[errors.length - 1]) : 0,
  };
}
