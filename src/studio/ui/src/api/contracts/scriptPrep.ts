// The Script page's preparation record: each chapter's prep state, kept in the project's <app>/script-prep.json
// (src/studio/desktop/internal/scriptprep). A word's pronunciation is not here: it is the Story Bible entry's name's (#2595), and a
// schema 1 file's flagged words are moved into the Story Bible once when the project opens.

/** A chapter's prep state, the Studio Next mock's PrepState: not started, in progress, prepped. */
export const PREP_STATES = ['none', 'progress', 'prepped'] as const;
export type PrepState = (typeof PREP_STATES)[number];

/** The opening and closing credits' prep ids: no manuscript chapter, but kept and listed (after the chapters, once set) like one. */
export const SCRIPT_PREP_CREDITS_IDS: readonly string[] = ['credits:opening', 'credits:closing'];

export type ScriptPrepChapter = { chapterId: string; state: PrepState };

/** Every manuscript chapter in order with its state (`none` when never set), then the credits once set. */
export type ScriptPrep = {
  chapters: ScriptPrepChapter[];
};

export interface ScriptPrepApi {
  /** Every chapter's prep state. */
  scriptPrepList(): Promise<ScriptPrep>;
  /** Stores one chapter's prep state. A chapter the manuscript lacks is refused. */
  scriptPrepSetChapter(chapterId: string, state: PrepState): Promise<ScriptPrepChapter>;
}
