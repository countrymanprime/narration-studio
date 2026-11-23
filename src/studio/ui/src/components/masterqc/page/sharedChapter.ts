// The chapter the chapter pages open on. The app has no app-wide chapter store, so Master & QC shares the one Proof remembers:
// a per-viewer convenience in browser storage under Proof's own key, never a host field. Storage can be missing, full or blocked, so every
// access is guarded and a failed write only means the choice lasts for this visit.
import { readProjectStorage, writeProjectStorage } from '../../../projectFolder';

const KEPT = 'proof.lastChapter';

/** The chapter Proof or Master & QC last showed for this project, or '' when none is kept or storage cannot be read. */
export const loadSharedChapter = (projectFolder: string): string => readProjectStorage(KEPT, projectFolder) ?? '';

/** Remembers the chapter Master & QC is on, for Proof (and any page that reads the same key) to open on. */
export function saveSharedChapter(projectFolder: string, chapterId: string): void {
  writeProjectStorage(KEPT, projectFolder, chapterId);
}
