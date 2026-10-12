// Where the narrator was in the reader: the chapter in view and how far into it, kept per viewer in browser storage. Storage
// can be missing, full or blocked (a private window, cleared site data), so every access is guarded and the reader opens at
// its first chapter when nothing is stored or storage fails.

export type ReaderPosition = { chapterId: string; offset: number };

export const READER_POSITION_KEY = 'narration.script.reader.position';

export function loadReaderPosition(key: string = READER_POSITION_KEY): ReaderPosition | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { chapterId, offset } = parsed as Record<string, unknown>;
    return typeof chapterId === 'string' && typeof offset === 'number' && Number.isFinite(offset) ? { chapterId, offset } : null;
  } catch {
    return null;
  }
}

export function saveReaderPosition(position: ReaderPosition, key: string = READER_POSITION_KEY): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(position));
  } catch {
    // Storage can be unavailable; the position is a convenience.
  }
}
