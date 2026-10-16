// The Script page's preparation record: each chapter's prep state and the words flagged for pronunciation, each with how it is
// said and the id of the pronunciation source the value came from (ADR 0792). It is kept in the project's
// narration-utils/script-prep.json (apps/desktop/internal/scriptprep) and each flag is checked against the current text on every
// read, so a flag whose line is gone, whose range no longer fits or whose words changed comes back stale rather than moved
// (ADR 0849).

/** A chapter's prep state, the Studio Next mock's PrepState: not started, in progress, prepped. */
export const PREP_STATES = ['none', 'progress', 'prepped'] as const;
export type PrepState = (typeof PREP_STATES)[number];

/** A word's pronunciation status, worked out on the host: the mock's Set, Not set and Not flagged. */
export const WORD_STATUSES = ['set', 'not_set', 'not_flagged'] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];

/** The most UTF-16 units a flagged range and a say-value hold (a JS string's length). */
export const SCRIPT_WORD_MAX = 80;
export const SCRIPT_SAY_MAX = 200;

/** The source id of a say-value the narrator typed; a say-value saved with no source is one. */
export const SCRIPT_SAY_MANUAL_SOURCE = 'manual';

export type ScriptWordStaleReason = 'paragraph_missing' | 'range_out_of_range' | 'text_changed';

/** The opening and closing credits' prep ids: no manuscript chapter, but kept and listed (after the chapters, once set) like one. */
export const SCRIPT_PREP_CREDITS_IDS: readonly string[] = ['credits:opening', 'credits:closing'];

export type ScriptPrepChapter = { chapterId: string; state: PrepState };

/** One flagged range of one line. */
export type ScriptWordFlag = {
  id: string;
  chapterId: string;
  paragraphId: string;
  /** The line's manuscript index (`ManuscriptParagraph.index`), or null when the line is no longer in the chapter. */
  paragraph: number | null;
  /** UTF-16 offsets into the line's text (JS string indexes), start before end. For a stale flag, where it was placed. */
  start: number;
  end: number;
  /** The line's own text for the range when it was flagged. */
  quote: string;
  createdAt: string;
  stale: boolean;
  staleReason?: ScriptWordStaleReason;
};

/** One flagged word: its key (the flagged text, trimmed and lower-cased), how it is said and the source id of that value (both
 * empty while nothing is set), its status and its flags in reading order. A word whose last flag was just removed comes back
 * once with no flags, no value and `not_flagged`. */
export type ScriptWord = {
  word: string;
  say: string;
  source: string;
  status: WordStatus;
  flags: ScriptWordFlag[];
};

/** Every manuscript chapter in order with its state (`none` when never set), and every flagged word in reading order of its
 * first flag. */
export type ScriptPrep = {
  chapters: ScriptPrepChapter[];
  words: ScriptWord[];
};

export interface ScriptPrepApi {
  /** Every chapter's prep state and every flagged word, each flag checked against the current manuscript. */
  scriptPrepList(): Promise<ScriptPrep>;
  /** Stores one chapter's prep state. A chapter the manuscript lacks is refused. */
  scriptPrepSetChapter(chapterId: string, state: PrepState): Promise<ScriptPrepChapter>;
  /** Flags a range of one line. The host refuses a range the line lacks and takes the word from the line; the same range flagged
   * again is the one flag. Answers the word with all its flags. */
  scriptWordFlag(chapterId: string, paragraphId: string, start: number, end: number): Promise<ScriptWord>;
  /** Stores how a flagged word is said and the id of the pronunciation source the value came from (one `pronunciationSources`
   * lists); an empty source means the narrator typed it, and an empty say clears the value and keeps the word flagged. */
  scriptWordSay(word: string, say: string, source: string): Promise<ScriptWord>;
  /** Removes one flag and answers its word; the say-value is dropped with the word's last flag. */
  scriptWordUnflag(flagId: string): Promise<ScriptWord>;
}
