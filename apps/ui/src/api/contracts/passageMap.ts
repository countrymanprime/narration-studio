// The Booth's passage map (docs/architecture/manuscript-teleprompter.md#the-passage-map): when a recording stops, the Booth
// sends the run of marks it noted (where each take began, and where the one before it ended), and the host checks them
// against the manuscript, stamps them with the ids the DAW gave the recorded item and take, and keeps them in the project's
// narration-utils/passagemap.json (apps/desktop/internal/passagemap). Editing lists a Booth-recorded chapter's passages from this log. Every read checks the
// marks against the current text, so a mark whose paragraph is gone or whose word is past its end comes back stale rather
// than moved.

/** The most marks one recording holds, and the longest id, in bytes (apps/desktop/internal/passagemap). */
export const PASSAGE_MAP_MAX_MARKS = 1000;
export const PASSAGE_MAP_MAX_ID = 64;
/** The furthest a mark can be into a chapter recording, in seconds: a day. */
export const PASSAGE_MAP_MAX_SECONDS = 86400;

/** A recording is a start, any number of rolls, and a stop. */
export type PassageMarkKind = 'start' | 'roll' | 'stop';

export type PassageMarkStaleReason = 'paragraph_missing' | 'word_out_of_range';

/** A spot in the text: a paragraph and a word index in it, from 0 to its word count. */
export type PassagePlace = { pid: string; word: number };

/** One mark as the Booth sends it. A roll or a stop says in `prev` where the take before it ended; a start has no `prev`. */
export type PassageMarkInput = {
  pid: string;
  word: number;
  /** Seconds into the chapter recording. */
  sec: number;
  kind: PassageMarkKind;
  prev?: PassagePlace;
};

/** One mark as stored, with the DAW's ids the host stamped when the recording stopped. */
export type PassageMark = PassageMarkInput & {
  id: string;
  /** The recording (one Record to Stop) the mark belongs to. */
  run: string;
  chapterId: string;
  /** The recorded item's id: the DAW's item GUID, or the built-in recorder's take name; empty when the DAW could not be read. */
  itemGuid: string;
  /** The take this mark began; empty when the DAW could not be read. */
  takeGuid: string;
  stale: boolean;
  staleReason?: PassageMarkStaleReason;
};

export interface PassageMapApi {
  /**
   * Stores one recording's marks for a chapter: a start, any rolls and a stop, in time order, each on a paragraph of that
   * chapter. The host stamps the DAW's ids; a run that breaks a rule is refused with a sentence and nothing is saved.
   */
  passageMapRecordRun(chapterId: string, run: PassageMarkInput[]): Promise<PassageMark[]>;
  /** A chapter's marks, recordings in the order they were made, each checked against the current manuscript. */
  passageMapList(chapterId: string): Promise<PassageMark[]>;
}
