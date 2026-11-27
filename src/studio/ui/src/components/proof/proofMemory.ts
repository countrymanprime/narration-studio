import { folderKey } from '../../projectFolder';

/**
 * What Proof keeps while the narrator is on another page: the note selected in each scope (a chapter, or All chapters) and the decision note typed
 * for a finding and not yet saved. Back from Booth, Script or Editing opens the page again, and without this it would start on the first note with an
 * empty box. It lives for the session only; the page's own state stays the truth while it is open.
 *
 * It also keeps, per project, whether the narrator chose All chapters. Proof otherwise opens on the chapter it last showed (`masterqc/page/sharedChapter.ts`, which holds a chapter
 * and cannot say "All"), so a narrator who stepped back to All chapters is not put back on a chapter (#4099).
 */
const selected = new Map<string, string>();
const drafts = new Map<string, string>();
const allChosen = new Set<string>();
let moved = false;

const scopeKey = (projectFolder: string, scope: string): string => `${folderKey(projectFolder)}\u0000${scope}`;

export const recallSelection = (projectFolder: string, scope: string): string | null => selected.get(scopeKey(projectFolder, scope)) ?? null;
export const rememberSelection = (projectFolder: string, scope: string, id: string): void => void selected.set(scopeKey(projectFolder, scope), id);

/**
 * Whether the app has gone to a second address in this session. The first address of a session is the page the app was opened on (a restart or a reload), which opens on
 * what was kept; after that a Back or Forward onto an entry shows that entry as it was left, never one rewritten to the kept chapter (#4099).
 */
export const appHasMoved = (): boolean => moved;
export const noteAppMoved = (): void => void (moved = true);

/** Whether the narrator's last choice of scope in this project, this session, was All chapters. */
export const chosenAll = (projectFolder: string): boolean => allChosen.has(folderKey(projectFolder));
/** Notes the scope the narrator chose: All chapters, or a chapter. */
export function chooseAll(projectFolder: string, all: boolean): void {
  if (all) allChosen.add(folderKey(projectFolder));
  else allChosen.delete(folderKey(projectFolder));
}

/** The typed, unsaved note for a finding, or undefined when none is kept. */
export const recallDraft = (id: string): string | undefined => drafts.get(id);
/** Keeps what was typed; text equal to the saved note, or nothing, is no draft. */
export function rememberDraft(id: string, text: string, saved: string): void {
  if (text === saved) drafts.delete(id);
  else drafts.set(id, text);
}
export const forgetDraft = (id: string): void => void drafts.delete(id);

/** Forgets everything: for tests. */
export function forgetProofMemory(): void {
  selected.clear();
  drafts.clear();
  allChosen.clear();
  moved = false;
}
