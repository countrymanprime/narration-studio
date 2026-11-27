import { readProjectStorage, writeProjectStorage } from '../../projectFolder';
import { ALL_CHAPTERS } from '../primitives/ChapterStepper';

// What Proof was showing, per project: one chapter, or All chapters. Opening Proof with no chapter in the address returns to it (#4099), as Editing and the Booth do. It is not
// the shared chapter (`masterqc/page/sharedChapter.ts`): that one is "the chapter you last looked at", written by Master & QC too, and cannot say All chapters was the choice.
// A per-viewer convenience in browser storage under its own key, never a host field; the helpers guard storage that is missing, full or blocked.
const PROJECT_KEY = 'proof.scope';

/** The scope Proof last showed for this project: a chapter id, All chapters, or null when none is kept (no project, nothing kept, storage unreadable). */
export const loadProofScope = (projectFolder: string): string | null => readProjectStorage(PROJECT_KEY, projectFolder);

/** Remembers the scope Proof is showing. A failed write only means it is not kept past this visit. */
export function saveProofScope(projectFolder: string, scope: string): void {
  writeProjectStorage(PROJECT_KEY, projectFolder, scope === '' ? ALL_CHAPTERS : scope);
}
