// The stack record and the retry choice (ADR 0858), kept in the project's narration-utils/editing/stacks.json
// (apps/desktop/internal/editlog/stacks.go) apart from the passage list, so re-reading the passages from a newer Booth map keeps
// them. A stack is the host's memory of the takes the DAW stacked on a passage's first read, with where each began before,
// in seconds after the first read's start, so un-stacking can put it back after a restart. It is recorded only after the DAW
// accepted stackTakes and forgotten after unstackTakes; recording or removing one changes nothing in the DAW. Passages and
// takes are named by the ids the Takes panel offers: an id, never a path.

/** How a passage's retries are kept: stacked on the first read's spot, or left where they were recorded. The default is
 * `leave`; the mode decides only what the page offers. */
export type RetryMode = 'stack' | 'leave';

/** Where a retry mode is set; a passage's overrides its chapter's, which overrides the project's. */
export type RetryLevel = 'project' | 'chapter' | 'passage';

/** How the DAW made the stack (the capability's mode): itself, in the app (the built-in recorder), or in steps after a backup. */
export type EditStackMode = 'native' | 'app' | 'steps';

/** The most takes one passage offers or one stack holds, and the longest id (apps/desktop/internal/editlog/stacks.go). */
export const STACK_MAX_TAKES = 500;
export const STACK_MAX_ID = 256;
/** The most undo points a stack's result may report (dawport.MaxUndoSteps), and the most steps it may list. */
export const STACK_MAX_UNDO_STEPS = 12;
export const STACK_MAX_STEPS = 64;

/** One take stacked on the first read, and the seconds after the first read's start where it began before. */
export type EditStackMove = { takeId: string; offset: number };

/** What the app sends after the DAW accepted stackTakes: the passage, its first read, every take it offers, the moves and the
 * DAW's result (its undo steps; for a steps DAW its steps and the backup taken first). */
export type EditStackRecordRequest = {
  passageId: string;
  base: string;
  takes: string[];
  moves: EditStackMove[];
  mode: EditStackMode;
  undoSteps: number;
  steps?: string[];
  backupId?: string;
};

/** A passage's stack: the mock's PassageStack with its chapter and the DAW's result for the last record that added to it.
 * A take leaves `offsets` when it is un-stacked, and the stack goes with its last take. */
export type PassageStack = {
  id: string;
  chapterId: string;
  passageId: string;
  base: string;
  offsets: Record<string, number>;
  mode: EditStackMode;
  undoSteps: number;
  steps?: string[];
  backupId?: string;
  at: string;
};

/** One chapter's stacks, by passage id. */
export type EditStackList = { chapterId: string; stacks: PassageStack[] };

/** What a record or remove answers: the chapter's stacks after the call and the take ids it changed (empty when none). */
export type EditStackChange = EditStackList & { changed: string[] };

/** The retry mode at a level: what applies there (`mode`, from the level `from` names, or `default`), and what the level
 * itself sets (`set`; absent when it follows the level above). */
export type RetryModeAnswer = {
  level: RetryLevel;
  chapterId?: string;
  passageId?: string;
  mode: RetryMode;
  from: RetryLevel | 'default';
  set?: RetryMode;
};

export interface EditStacksApi {
  /** A chapter's stacks by passage id. */
  editingStacksList(chapterId: string): Promise<EditStackList>;
  /** Stores the takes the DAW stacked. Refused, with nothing saved, when the first read or a moved take is not one of the
   * passage's takes, an offset is negative or not finite, there is no move, a take is already stacked on the passage, or the
   * DAW's result is missing. */
  editingStackRecord(chapterId: string, stack: EditStackRecordRequest): Promise<EditStackChange>;
  /** Forgets stacked takes once the DAW put them back, or when the journal undoes the stack: some for a partial un-stack. */
  editingStackRemove(chapterId: string, passageId: string, takeIds: string[]): Promise<EditStackChange>;
  /** The retry mode at a level: the project names no chapter or passage (''), a chapter its chapter, a passage both. */
  editingRetryModeGet(level: RetryLevel, chapterId: string, passageId: string): Promise<RetryModeAnswer>;
  /** Sets the retry mode at a level, or with '' takes it back so the level follows the one above. */
  editingRetryModeSet(level: RetryLevel, chapterId: string, passageId: string, mode: RetryMode | ''): Promise<RetryModeAnswer>;
}
