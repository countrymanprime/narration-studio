// Where the narrator left the Booth, per project: the chapter and the place in it. Opening the Booth with no chapter asked for returns to it.
// A per-viewer convenience in browser storage, never a host field (docs/reference/data-files.md has no row for it, as for the Script reader's
// position and Proof's last chapter). Storage can be missing, full or blocked, so every access is guarded and the Booth then opens as it
// would have without it.

export type LastPlace = { chapterId: string; paragraphId: string; word: number };

const lastPlaceKey = (projectFolder: string): string => `narration.booth.lastPlace.${projectFolder}`;

export function loadLastPlace(projectFolder: string): LastPlace | null {
  try {
    const raw = window.localStorage.getItem(lastPlaceKey(projectFolder));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { chapterId, paragraphId, word } = parsed as Record<string, unknown>;
    if (typeof chapterId !== 'string' || chapterId === '') return null;
    return {
      chapterId,
      paragraphId: typeof paragraphId === 'string' ? paragraphId : '',
      word: typeof word === 'number' && Number.isFinite(word) && word > 0 ? Math.floor(word) : 0,
    };
  } catch {
    return null;
  }
}

export function saveLastPlace(projectFolder: string, place: LastPlace): void {
  try {
    window.localStorage.setItem(lastPlaceKey(projectFolder), JSON.stringify(place));
  } catch {
    // Storage can be unavailable; the Booth then opens on the DAW's chapter or the first, as it did.
  }
}
