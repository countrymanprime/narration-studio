import { readProjectStorage, writeProjectStorage } from '../../projectFolder';
// The chapter the narrator was last on in Editing, per project: Editing opens on it when no chapter is asked for, so the DAW is taken back to it after
// a restart (#3428, A12). A per-viewer convenience in browser storage under Editing's own key, never a host field and never Proof's or Master & QC's
// (their last chapter means "the chapter you looked at"). Storage can be missing, full or blocked, and a value can be anything, so every access is
// guarded and a value that names no chapter of the book is the same as none.
const KEPT = 'editing.lastChapter';

/** The chapter Editing last showed for this project, or '' when none is kept, storage cannot be read or no project is open. */
export function loadEditingChapter(projectFolder: string): string {
  if (!projectFolder) return '';
  return readProjectStorage(KEPT, projectFolder) ?? '';
}

/** Remembers the chapter Editing is on. A failed write only means it is not kept past this visit. */
export function saveEditingChapter(projectFolder: string, chapterId: string): void {
  if (!projectFolder || !chapterId) return;
  writeProjectStorage(KEPT, projectFolder, chapterId); // a failed write only means the choice lasts for this visit
}
