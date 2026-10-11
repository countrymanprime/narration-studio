// The narrator's word effects (ADR 0856), kept in the project's narration-utils/editing/wordfx.json
// (apps/desktop/internal/editlog): the host's memory of the chains the DAW put on ranges of words (applyFxToRange), so an
// effect's underline survives a restart. The DAW owns the audio and the chain: an effect is recorded only after the DAW
// accepted it, and recording or removing one changes nothing in the DAW. `a` and `b` are in the chapter recording as it was
// before any cut, like a cut's (the editing model's `origTime` converts them; `curTime` gives where the effect sounds now).
// The chain is named as the DAW lists it, never by a path, and the host never opens it. An effect names its words by key
// with the text each had, so one whose words changed comes back stale and is never moved.

import type { AcceptedWordStaleReason } from './editLog';

/** What the app sends after the DAW accepted applyFxToRange: the words, the range in original time, the chain and the DAW's result. */
export type WordFxRequest = {
  pid: string;
  /** The take the words were heard in; absent when the paragraph had no take of its own. */
  takeId?: string;
  /** Keys (`paragraphId:ordinal`) of one paragraph's words the effect is on. */
  keys: string[];
  /** The words, as shown in the question. */
  text: string;
  a: number;
  b: number;
  /** Seconds from the start of the take (or of the paragraph) before any cut. */
  off0: number;
  off1: number;
  /** The DAW's own id for the chain (REAPER: its name in FXChains as list_fx_chains gives it), how the list shows it and the
   * list's title. None may be a path: a backslash, a drive colon or an empty, `.` or `..` part is refused. */
  chainId: string;
  chainName: string;
  source: string;
  /** The fades at the splits, in milliseconds. */
  fadeMs: number;
  /** The DAW the effect was added in and the id it gave it. */
  daw: string;
  guid: string;
  /** The backup taken before the effect (DAWs that change the audio itself). */
  backupId?: string;
};

/** A stored effect, checked against the current manuscript. */
export type WordFx = WordFxRequest & {
  id: string;
  chapterId: string;
  /** The text each key had when the effect was added, in the order of `keys`. */
  words: string[];
  at: string;
  /** The line's manuscript index, or null when the line is no longer in the chapter. */
  paragraph: number | null;
  stale: boolean;
  staleReason?: AcceptedWordStaleReason;
};

/** One chapter's word effects, in the original recording's time order. */
export type WordFxList = {
  chapterId: string;
  effects: WordFx[];
};

/** What a record or remove answers: the chapter's effects after the call, the ids it changed (empty when none) and, for a
 * record, the effects already on some of the same words (a chain on top of a chain is allowed; the page says so). */
export type WordFxChange = WordFxList & {
  changed: string[];
  over: string[];
};

export interface EditWordFxApi {
  /** A chapter's word effects in time order, each checked against the current manuscript. */
  editingWordFxList(chapterId: string): Promise<WordFxList>;
  /** Stores an effect the DAW added. Refused, with nothing saved, when a word is not in the paragraph's current text, the
   * words sit in more than one take, the range is not one the app sends, the DAW's result is missing, or the chain id or
   * name could be a path. */
  editingWordFxRecord(chapterId: string, fx: WordFxRequest): Promise<WordFxChange>;
  /** Forgets an effect: the inverse the journal calls when the DAW change is undone, or the record of the DAW taking it off. */
  editingWordFxRemove(chapterId: string, id: string): Promise<WordFxChange>;
}
