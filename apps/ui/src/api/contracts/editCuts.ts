// The narrator's cuts (ADR 0856), kept in the project's narration-utils/editing/cuts.json (apps/desktop/internal/editlog):
// the host's memory of the words a deleteRange hid in the DAW, so struck words survive a restart. The DAW owns the audio:
// a cut is recorded only after the DAW accepted it, and it never deletes anything. `a` and `b` are in the chapter
// recording as it was before any cut (the editing model's `origTime` converts them); the host stores the numbers. A cut
// names its words by key with the text each had, so one whose words changed comes back stale and is never moved.

import type { AcceptedWordStaleReason } from './editLog';

export type EditCutMode = 'close' | 'gap';

/** What the app sends after the DAW accepted a deleteRange: the words, the range in original time and the DAW's result. */
export type EditCutRequest = {
  pid: string;
  /** The take the words were heard in; absent when the paragraph had no take of its own. */
  takeId?: string;
  /** Keys (`paragraphId:ordinal`) of the paragraph's words the cut hides. */
  keys: string[];
  /** The words, as shown in the question. */
  text: string;
  a: number;
  b: number;
  /** Seconds from the start of the take (or of the paragraph) before any cut. */
  off0: number;
  off1: number;
  /** `close`: the audio that follows moves up by the length of the cut. `gap`: the length stays. */
  mode: EditCutMode;
  /** Crossfade at the join in milliseconds: 0, 6, 12 or 25. */
  fadeMs: number;
  /** The DAW the cut was made in, the id it gave the cut and how many undo points it added (0 for an app-kept edit list). */
  daw: string;
  guid: string;
  undoSteps: number;
  /** The backup taken before the cut (DAWs that change the audio itself). */
  backupId?: string;
};

/** A stored cut, checked against the current manuscript. */
export type EditCut = Omit<EditCutRequest, 'mode'> & {
  id: string;
  chapterId: string;
  mode: EditCutMode;
  /** The text each key had when the cut was made, in the order of `keys`. */
  words: string[];
  at: string;
  /** The line's manuscript index, or null when the line is no longer in the chapter. */
  paragraph: number | null;
  stale: boolean;
  staleReason?: AcceptedWordStaleReason;
};

/** One chapter's cuts, in the original recording's time order. */
export type EditCuts = {
  chapterId: string;
  cuts: EditCut[];
};

/** What a record or remove answers: the chapter's cuts after the call and the ids it changed (empty when none). */
export type EditCutsChange = EditCuts & {
  changed: string[];
};

export interface EditCutsApi {
  /** A chapter's cuts in time order, each checked against the current manuscript. */
  editingCutsList(chapterId: string): Promise<EditCuts>;
  /** Stores a cut the DAW made. Refused, with nothing saved, when a word is not in the paragraph's current text, the range
   * or options are not ones the app sends, the DAW's result is missing, or it overlaps a stored cut on the same take. */
  editingCutRecord(chapterId: string, cut: EditCutRequest): Promise<EditCutsChange>;
  /** Forgets a cut: the inverse the journal calls when the DAW change is undone in the session. */
  editingCutRemove(chapterId: string, id: string): Promise<EditCutsChange>;
}
