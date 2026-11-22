import type { HeardWord } from '../../../ports/alignment';
import { loadRealSpeech, REAL_SPEECH_FILES, type RealSpeech } from './realSpeechFixture';
import type { ChapterRead } from './chapterSource';
import { readFrom } from './readFixture';

/**
 * A take shaped like the sidecar's answer, built from the real LibriVox alignments the end-of-play test already uses
 * (`model/fixtures/realSpeech`): the recogniser's own word times, grouped into paragraphs by its segments. A misspoken word and its
 * correction, a long pause, a late start and a different item are put into the same words, so the model sees what the host sends for a real take.
 */
export const REAL_TAKES = REAL_SPEECH_FILES;

export const loadRealTake = loadRealSpeech;

/** What the recording said about one word of the take: the script word it is, or that it was said and is not in the script. */
interface SaidWord {
  /** Script paragraph and ordinal; absent for a word said and not in the script. */
  paragraphId?: string;
  ordinal?: number;
  text: string;
  /** Seconds of the item's source where the word really sounds: what the audio holds. */
  off0: number;
  off1: number;
  item: number;
  added?: true;
}

export interface Take {
  paragraphs: Array<{ id: string; text: string }>;
  said: SaidWord[];
}

export interface TakeOptions {
  /** Paragraphs to keep, from the first the take has. */
  paragraphs?: number;
  /** Seconds the recording starts before its first word (a trimmed head moves everything). */
  head?: number;
  /** The script word, by index in the take, that was misspoken then corrected: said twice, the second `pause` seconds after the first. */
  fumble?: { at: number; pause: number; misspoken?: string; asHeard?: 'script-word-first' | 'script-word-second' };
  /** Seconds to add between paragraphs. */
  between?: number;
  /** Words per paragraph at most. */
  perParagraph?: number;
}

export function takeFrom(real: RealSpeech, opts: TakeOptions = {}): Take {
  const maxParagraphs = opts.paragraphs ?? 4;
  const cap = opts.perParagraph ?? 40;
  const paragraphs: Take['paragraphs'] = [];
  const said: SaidWord[] = [];
  const bySeg = new Map<number, RealSpeech['words']>();
  for (const w of real.words) bySeg.set(w.seg, [...(bySeg.get(w.seg) ?? []), w]);
  const segs = [...bySeg.values()].filter((s) => s.length >= 4).slice(0, maxParagraphs);
  let shift = (opts.head ?? 0) - (segs[0]?.[0].t0 ?? 0);
  let flat = 0;
  segs.forEach((seg, p) => {
    const id = `p-${String(p + 1).padStart(3, '0')}`;
    const words = seg.slice(0, cap);
    paragraphs.push({ id, text: words.map((w) => w.w).join(' ') });
    if (p > 0) shift += opts.between ?? 0;
    words.forEach((w, ordinal) => {
      const base = { paragraphId: id, ordinal, item: 0 };
      const f = opts.fumble;
      if (f && flat === f.at) {
        // The misspoken attempt, then the correction after a pause: everything after moves later by the correction and the pause.
        const len = w.t1 - w.t0;
        const again = w.t1 + shift + f.pause;
        // The host pairs the script word with the first attempt (the misspoken one, as it heard it) and sends the correction as an extra word, or the other way round.
        const second = f.asHeard === 'script-word-second';
        said.push({
          ...(second ? {} : base),
          text: f.misspoken ?? w.w,
          off0: w.t0 + shift,
          off1: w.t1 + shift,
          item: 0,
          ...(second ? { added: true as const } : {}),
        });
        said.push({ ...(second ? base : {}), text: w.w, off0: again, off1: again + len, item: 0, ...(second ? {} : { added: true as const }) });
        shift += f.pause + len;
      } else {
        said.push({ ...base, text: w.w, off0: w.t0 + shift, off1: w.t1 + shift });
      }
      flat++;
    });
  });
  return { paragraphs, said };
}

const heardWords = (take: Take): HeardWord[] =>
  take.said.map((s) => ({
    text: s.text,
    ...(s.paragraphId !== undefined ? { paragraphId: s.paragraphId, ordinal: s.ordinal } : {}),
    item: s.item,
    off0: s.off0,
    off1: s.off1,
    conf: 1,
    ...(s.added ? { added: true as const, timing: 'spread' as const } : {}),
  }));

export const readOf = (take: Take): ChapterRead => readFrom(take.paragraphs, heardWords(take));
