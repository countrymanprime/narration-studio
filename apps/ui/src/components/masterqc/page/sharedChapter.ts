// The chapter the chapter pages open on. The app has no app-wide chapter store, so Master & QC shares the one Proof remembers (ADR 0750):
// a per-viewer convenience in browser storage under Proof's own key, never a host field. Storage can be missing, full or blocked, so every
// access is guarded and a failed write only means the choice lasts for this visit.
const key = (projectFolder: string): string => `narration.proof.lastChapter.${projectFolder}`;

/** Remembers the chapter Master & QC is on, for Proof (and any page that reads the same key) to open on. */
export function saveSharedChapter(projectFolder: string, chapterId: string): void {
  try {
    window.localStorage.setItem(key(projectFolder), chapterId);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}
