// Where the narrator was in the reader, per project: the chapter in view and how far into it, kept per viewer in browser storage under the project's folder
// (`narration.script.reader.position.<folder>`, the shared helper in projectFolder.ts), so a project opens at its own place and never at another's (#4091).
// The key an earlier build kept with no folder in it is not read: it does not say which project it belonged to, so it is left alone and never applied.
// Storage can be missing, full or blocked (a private window, cleared site data), so every access is guarded and the reader opens at its first chapter
// when nothing is stored, storage fails or no project is open.
import { readProjectStorage, writeProjectStorage } from '../../../../projectFolder';

export type ReaderPosition = { chapterId: string; offset: number };

const PROJECT_KEY = 'script.reader.position';

/** The place this project's reader was left at, or null when none is kept, the value is not a place, storage cannot be read or no project is open. */
export function loadReaderPosition(projectFolder: string): ReaderPosition | null {
  try {
    const raw = readProjectStorage(PROJECT_KEY, projectFolder);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { chapterId, offset } = parsed as Record<string, unknown>;
    return typeof chapterId === 'string' && typeof offset === 'number' && Number.isFinite(offset) ? { chapterId, offset } : null;
  } catch {
    return null;
  }
}

/** Remembers where this project's reader is. A failed write, or no project open, only means the place is not kept past this visit. */
export function saveReaderPosition(position: ReaderPosition, projectFolder: string): void {
  writeProjectStorage(PROJECT_KEY, projectFolder, JSON.stringify(position));
}
