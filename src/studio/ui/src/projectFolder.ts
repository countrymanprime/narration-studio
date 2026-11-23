/**
 * A project folder as one folder: a backslash and a slash are the same separator, repeated and trailing separators are nothing, and a leading double separator (a network share) stays.
 * The root folder is `/` and a drive's root `C:/` (an empty folder means no project, so no root normalises to it, and `C:` without a separator is not the root). The host may spell the one folder both ways (the start-up path and the recent list do),
 * so everything the app keeps per project (an address's owner, a remembered place) goes through this one function (#4099).
 *
 * The case is folded for a Windows-style path (a drive letter, or a network share) and only for those: the host compares them without case (internal/recents/store.go `samePath`,
 * internal/project/match.go `normalizePath`), while a POSIX path is case-sensitive (`X` and `x` are two folders there).
 */
export function folderKey(folder: string): string {
  const slashed = folder.replace(/\\/g, '/');
  const lead = slashed.startsWith('//') ? '//' : '';
  const joined =
    lead +
    slashed
      .slice(lead.length)
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '');
  if (joined === '') return folder === '' ? '' : '/';
  // A drive and its root are two folders on Windows (`C:` is the drive's own current directory, `C:/` its root).
  if (/^[A-Za-z]:$/.test(joined) && /[\\/]$/.test(folder)) return `${joined.toLowerCase()}/`;
  return lead !== '' || /^[A-Za-z]:/.test(joined) ? joined.toLowerCase() : joined;
}

/** Whether two project folders are one folder (see `folderKey`). */
export const isSameProject = (a: string, b: string): boolean => folderKey(a) === folderKey(b);

const prefixOf = (name: string): string => `narration.${name}.`;

/** The browser-storage key of what `name` (for example `booth.lastPlace`) keeps for this project: the normalised folder, so one folder spelled two ways is one place. */
export const projectStorageKey = (name: string, folder: string): string => prefixOf(name) + folderKey(folder);

/** How many storage keys a read looks through for an old spelling; a storage fuller than this is not searched past it. */
const SCAN_LIMIT = 5000;

/** A value an earlier build kept for this project under a spelling other than the normalised one. */
export type LegacyEntry = { key: string; value: string };

/**
 * What earlier builds kept for this project under `name`, whatever the spelling: every storage key with the prefix `narration.<name>.` whose folder part is this folder by
 * `folderKey`, other than the normalised key itself. The caller's own spelling comes first, then the rest in key order. Empty when storage cannot be read; never throws.
 */
function legacyEntries(name: string, folder: string): LegacyEntry[] {
  try {
    const prefix = prefixOf(name);
    const wanted = folderKey(folder);
    const normalised = prefix + wanted;
    const own = prefix + folder;
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < Math.min(storage.length, SCAN_LIMIT); i += 1) {
      const key = storage.key(i);
      if (key !== null && key !== normalised && key.startsWith(prefix) && folderKey(key.slice(prefix.length)) === wanted) keys.push(key);
    }
    keys.sort((a, b) => (a === own ? -1 : b === own ? 1 : a < b ? -1 : a > b ? 1 : 0));
    return keys.flatMap((key) => {
      const value = storage.getItem(key);
      return value === null ? [] : [{ key, value }];
    });
  } catch {
    return [];
  }
}

/**
 * Reads what `name` keeps for this project. A value under the normalised key wins. Failing that, what an earlier build kept under any spelling of the folder (`legacyEntries`) is
 * chosen by `choose` (the first by default: the caller's own spelling, else the lowest key, as a plain value carries nothing to compare them by), copied to the normalised key (the old
 * keys are left alone) and returned. Null when no project is open (an empty folder), storage is blocked or holds nothing; never throws.
 */
export function readProjectStorage(name: string, folder: string, choose: (entries: LegacyEntry[]) => string = (entries) => entries[0]!.value): string | null {
  if (!folder) return null;
  try {
    const key = projectStorageKey(name, folder);
    const kept = window.localStorage.getItem(key);
    if (kept !== null) return kept;
    const entries = legacyEntries(name, folder);
    if (entries.length === 0) return null;
    const chosen = entries.length === 1 ? entries[0]!.value : choose(entries);
    try {
      window.localStorage.setItem(key, chosen);
    } catch {
      /* the copy is only a convenience: the value is still returned */
    }
    return chosen;
  } catch {
    return null;
  }
}

/** Keeps `value` for this project under the normalised key. False when no project is open (an empty folder) or storage refused it (blocked or full). */
export function writeProjectStorage(name: string, folder: string, value: string): boolean {
  if (!folder) return false;
  try {
    window.localStorage.setItem(projectStorageKey(name, folder), value);
    return true;
  } catch {
    return false;
  }
}
