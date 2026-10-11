import type { CoverageReason } from '../api/contracts/coverage';
import type { WorkspaceAlignmentResult, WorkspaceWordTiming } from '../api/contracts/workspace';
import type { NarrationApi } from '../types';

// The alignment port (ADR 0855): what the recording sounds like, word by word, read from the chapter's stored alignment
// (ADR 0242). It never runs an alignment or a check: a chapter with nothing transcribed answers null with the reason.
// The page asks this for words and never knows the recogniser; a later source replaces the adapter and no caller changes.

/** One word heard, in seconds of its item's source. A word of the script carries its paragraph and ordinal; an added
 * word (said, not in the script) carries neither, and `timing` says how its times were found. */
export interface HeardWord {
  text: string;
  /** The script word this is, absent for an added word or a heading word. */
  paragraphId?: string;
  ordinal?: number;
  /** The manifest item the word was heard on (WorkspaceItem.index). */
  item: number;
  off0: number;
  off1: number;
  /** 0 to 1, or null with `confReason` while the recogniser gives no word scores. */
  conf: number | null;
  confReason?: string;
  /** Said, but not in the script. */
  added?: true;
  /** For an added word only: spread between its run's ends, or unplaced (at its start, no duration). */
  timing?: WorkspaceWordTiming;
}

interface Heard {
  engine: { id: string; name: string };
  /** In reading order. */
  words: HeardWord[];
}

/** What was heard, or null with why nothing was. */
export type HeardAnswer = { heard: Heard } | { heard: null; reason: string; reasons: CoverageReason[] };

export interface AlignmentPort {
  heard(chapterId: string): Promise<HeardAnswer>;
}

/** The `NarrationApi` method the host adapter calls: no new binding. */
export type AlignmentHostApi = Pick<NarrationApi, 'workspaceAlignment'>;

const NEVER = 'Nothing has been transcribed yet: run the check on this chapter.';
const ALIGN_AGAIN = 'The check ran before words were aligned: align the chapter again to read what was heard.';

/** The heard words of a stored alignment, or null with the reason; a pure function of the binding's answer. */
function heardFrom(result: WorkspaceAlignmentResult): HeardAnswer {
  const reasons = result.reasons;
  if (result.state === 'never') return { heard: null, reason: NEVER, reasons };
  if (result.needsAlignAgain) return { heard: null, reason: ALIGN_AGAIN, reasons };
  // A payload from before ADR 0855 names no engine: its words cannot say who heard them.
  if (!result.engine) return { heard: null, reason: NEVER, reasons };
  const after = new Map<number, HeardWord[]>();
  const leading: HeardWord[] = [];
  for (const extra of result.extras) {
    const words: HeardWord[] = (extra.words ?? []).map((word) => ({
      text: word.text,
      item: word.item,
      off0: word.start,
      off1: word.end,
      conf: word.conf,
      ...(word.confReason !== undefined ? { confReason: word.confReason } : {}),
      added: true,
      timing: word.timing,
    }));
    if (extra.afterToken === undefined) leading.push(...words);
    else after.set(extra.afterToken, [...(after.get(extra.afterToken) ?? []), ...words]);
  }
  const words = [...leading];
  for (const token of result.tokens) {
    if (token.item !== undefined && token.start !== undefined && token.end !== undefined) {
      words.push({
        text: token.heard ?? token.text,
        ...(token.p !== undefined ? { paragraphId: token.p, ordinal: token.w } : {}),
        item: token.item,
        off0: token.start,
        off1: token.end,
        conf: token.conf ?? null,
        ...(token.confReason !== undefined ? { confReason: token.confReason } : {}),
      });
    }
    words.push(...(after.get(token.i) ?? []));
  }
  return { heard: { engine: result.engine, words } };
}

/** Reads `workspaceAlignment`. */
export function createHostAlignment(api: AlignmentHostApi): AlignmentPort {
  return { heard: async (chapterId) => heardFrom(await api.workspaceAlignment(chapterId)) };
}

const MOCK_ENGINE = { id: 'whisper:small', name: 'Whisper small' };
const NO_SCORE = { conf: null, confReason: 'no_word_scores' } as const;

/** The mock's sample chapter: words read, a misread ("begging"), a word not read (absent: "very") and an added "um". */
const SAMPLE_WORDS: HeardWord[] = [
  { text: 'Alice', paragraphId: 'p-000001', ordinal: 0, item: 0, off0: 5.0, off1: 5.3, ...NO_SCORE },
  { text: 'was', paragraphId: 'p-000001', ordinal: 1, item: 0, off0: 5.3, off1: 5.5, ...NO_SCORE },
  { text: 'begging', paragraphId: 'p-000001', ordinal: 2, item: 0, off0: 5.5, off1: 6.0, ...NO_SCORE },
  { text: 'um', item: 0, off0: 6.0, off1: 6.2, ...NO_SCORE, added: true, timing: 'spread' },
  { text: 'to', paragraphId: 'p-000001', ordinal: 3, item: 0, off0: 6.2, off1: 6.3, ...NO_SCORE },
  { text: 'get', paragraphId: 'p-000001', ordinal: 4, item: 0, off0: 6.3, off1: 6.5, ...NO_SCORE },
  { text: 'tired.', paragraphId: 'p-000001', ordinal: 6, item: 1, off0: 0.3, off1: 0.6, ...NO_SCORE },
];

export type MockAlignmentOptions = {
  /** Nothing has been transcribed for any chapter. */
  none?: boolean;
  /** Chapters that answer null (never checked, or checked before words were aligned). */
  untranscribed?: readonly string[];
  /** The words every other chapter answers. */
  words?: readonly HeardWord[];
};

/** The mock: answers the sample words for any chapter not listed as untranscribed. It never runs anything. */
export function createMockAlignment(options: MockAlignmentOptions = {}): AlignmentPort {
  const { none = false, untranscribed = [], words = SAMPLE_WORDS } = options;
  return {
    heard: (chapterId) =>
      Promise.resolve(
        none || untranscribed.includes(chapterId)
          ? { heard: null, reason: NEVER, reasons: [] }
          : { heard: { engine: { ...MOCK_ENGINE }, words: words.map((word) => ({ ...word })) } },
      ),
  };
}
