// Replace audio (#2251; src/studio/desktop/bindings_replace.go): the project's other narrators (a duet partner, a stand-in, a cast),
// their files brought into the DAW on tracks of their own, the plan for replacing a range of the narrator's words with a stretch of
// theirs, the edit, and Put my audio back. The page sends chapter ids, token indices, a narrator's or a file's id and seconds into
// their file, never a path or a DAW id.

import type { DawResult } from './daw';
import type { AcceptedWordStaleReason } from './editLog';
import type { WorkspacePeaks } from './workspace';

/** Whether a file of theirs is where it was added, gone, or changed since (its size or time differ). */
export type NarratorFileState = 'ok' | 'missing' | 'changed';

/** A file of another narrator's that the DAW took in. `length` is seconds; the path stays in the host. */
export type NarratorFile = {
  id: string;
  name: string;
  size: number;
  length: number;
  daw: string;
  addedAt: string;
  state: NarratorFileState;
};

/** Another narrator the project names. */
export type Narrator = {
  id: string;
  name: string;
  addedAt: string;
  files: NarratorFile[];
};

export type Narrators = { narrators: Narrator[] };

/** What adding or removing a narrator answers: the list after the call and the ids it changed (empty when none). */
export type NarratorsChange = Narrators & { changed: string[] };

/** What ReplaceAddFile answers: the DAW's answer, the new file's id ('' on a refusal or a cancel) and the list after the call. */
export type ReplaceFileAnswer = {
  result: DawResult;
  fileId: string;
  narrators: Narrators;
};

/** What ReplacePlan answers: the words and their project seconds, their stretch in seconds of their file, how far the audio after the
 * words will move (negative: earlier), and the loudness. `measuredLufs` is null when their stretch could not be measured, with
 * `loudnessNote` saying why; `clamped` says the level change was held to ±24 dB. A refusal is `result`'s. */
export type ReplacePlan = {
  result: DawResult;
  narrator: string;
  words: number;
  start: number;
  end: number;
  sourceStart: number;
  sourceEnd: number;
  shift: number;
  measuredLufs: number | null;
  targetLufs: number;
  gainDb: number;
  clamped: boolean;
  loudnessNote: string;
};

/** A replacement of the narrator's words, checked against the current text. `active` is false once the audio was put back. */
export type Replacement = {
  id: string;
  chapterId: string;
  keys: string[];
  words: string[];
  start: number;
  end: number;
  narratorId: string;
  narratorName: string;
  fileId: string;
  sourceStart: number;
  sourceEnd: number;
  gainDb: number;
  measuredLufs: number | null;
  targetLufs: number;
  fadeMs: number;
  shift: number;
  daw: string;
  undoSteps: number;
  at: string;
  restoredAt: string | null;
  active: boolean;
  paragraph: number | null;
  stale: boolean;
  staleReason?: AcceptedWordStaleReason;
};

export type Replacements = { chapterId: string; replacements: Replacement[] };

/** What forgetting a replacement answers: the chapter's replacements after the call and the ids it changed. */
export type ReplacementsChange = Replacements & { changed: string[] };

/** What DawReplaceRange and DawRestoreReplacement answer: the DAW's answer, the replacement's id ('' when nothing was replaced) and the
 * chapter's replacements after the call. */
export type ReplaceAnswer = {
  result: DawResult;
  replacementId: string;
  replacements: Replacements;
};

/** Their file's waveform for the range, or why there is none ('no waveform' for a file that is not a WAV). */
export type ReplaceFilePeaks = {
  fileId: string;
  length: number;
  peaks?: WorkspacePeaks;
  reason?: string;
};

/** The longest stretch, of theirs or of the narrator's words, one replacement takes, and the shortest, in seconds. */
export const REPLACE_MAX_SECONDS = 300;
export const REPLACE_MIN_SECONDS = 0.05;
/** The largest level change, either way, in dB. */
export const REPLACE_MAX_GAIN_DB = 24;

export interface ReplaceAudioApi {
  /** The project's other narrators and their files, each file checked against the disk. */
  replaceNarrators(): Promise<Narrators>;
  /** Names another narrator for the project; a name already there is not added twice. */
  replaceNarratorAdd(name: string): Promise<NarratorsChange>;
  /** Forgets another narrator who has no files in the project. */
  replaceNarratorRemove(id: string): Promise<NarratorsChange>;
  /** Opens the host's file dialog for a file of theirs and brings it into the DAW on a muted track named for them. A cancel changes
   * nothing. */
  replaceAddFile(narratorId: string): Promise<ReplaceFileAnswer>;
  /** Works out one replacement before anything changes, with the loudness of their stretch against the project's target. */
  replacePlan(chapterId: string, firstToken: number, lastToken: number, fileId: string, sourceStart: number, sourceEnd: number): Promise<ReplacePlan>;
  /** Replaces the words with their stretch in the DAW and records it; the later audio moves by the difference in length. */
  dawReplaceRange(
    chapterId: string,
    firstToken: number,
    lastToken: number,
    fileId: string,
    sourceStart: number,
    sourceEnd: number,
    fadeMs: number,
    gainDb: number,
  ): Promise<ReplaceAnswer>;
  /** Put my audio back: works after a restart, and marks the replacement put back. */
  dawRestoreReplacement(chapterId: string, replacementId: string): Promise<ReplaceAnswer>;
  /** A chapter's replacements, each checked against the current text. */
  editingReplacementsList(chapterId: string): Promise<Replacements>;
  /** Forgets a replacement: what the journal calls once the app's Undo took the DAW edit back. */
  editingReplacementRemove(chapterId: string, id: string): Promise<ReplacementsChange>;
  /** Their file's waveform, or why there is none. */
  replaceFilePeaks(fileId: string): Promise<ReplaceFilePeaks>;
}
