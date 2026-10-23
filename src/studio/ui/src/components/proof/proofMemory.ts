/**
 * What Proof keeps while the narrator is on another page: the note selected in each scope (a chapter, or All chapters) and the decision note typed
 * for a finding and not yet saved. Back from Booth, Script or Editing opens the page again, and without this it would start on the first note with an
 * empty box. It lives for the session only; the page's own state stays the truth while it is open.
 */
const selected = new Map<string, string>();
const drafts = new Map<string, string>();

const scopeKey = (projectFolder: string, scope: string): string => `${projectFolder}\u0000${scope}`;

export const recallSelection = (projectFolder: string, scope: string): string | null => selected.get(scopeKey(projectFolder, scope)) ?? null;
export const rememberSelection = (projectFolder: string, scope: string, id: string): void => void selected.set(scopeKey(projectFolder, scope), id);

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
}
