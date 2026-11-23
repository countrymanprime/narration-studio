/**
 * A project folder as one folder: a backslash and a slash are the same separator, repeated and trailing separators are nothing, and a leading double separator (a network share) stays. The case is kept: on
 * a case-sensitive file system `X` and `x` are two folders. The host may spell the one folder both ways (the start-up path and the recent list do), so everything the app keeps per project
 * (an address's owner, a remembered place) goes through this one function (#4099).
 */
export function folderKey(folder: string): string {
  const slashed = folder.replace(/\\/g, '/');
  const lead = slashed.startsWith('//') ? '//' : '';
  return (
    lead +
    slashed
      .slice(lead.length)
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '')
  );
}

/** Whether two project folders are one folder (see `folderKey`). */
export const isSameProject = (a: string, b: string): boolean => folderKey(a) === folderKey(b);

const keyFor = (name: string, folder: string): string => `narration.${name}.${folder}`;

/** The browser-storage key of what `name` (for example `booth.lastPlace`) keeps for this project: the normalised folder, so one folder spelled two ways is one place. */
export const projectStorageKey = (name: string, folder: string): string => keyFor(name, folderKey(folder));

/** The spellings of this folder an earlier build may have written a key under: as the caller has it, the folder with backslashes, and each with a trailing separator. */
function legacySpellings(folder: string): string[] {
  const normal = folderKey(folder);
  const backslashed = normal.replace(/\//g, '\\');
  return [...new Set([folder, backslashed, `${normal}/`, `${backslashed}\\`])].filter((spelling) => spelling !== normal);
}

/**
 * Reads what `name` keeps for this project. A value under the normalised key wins. Failing that, the value an earlier build wrote under the folder as it was then spelled (as the caller
 * has it, then with backslashes, then each with a trailing separator; the first found) is copied to the normalised key (the old key is left alone) and returned. Two old spellings
 * that both hold a value are not merged: the first in that order is taken. Null when no project is open (an empty folder), storage is blocked or holds nothing; never throws.
 */
export function readProjectStorage(name: string, folder: string): string | null {
  if (!folder) return null;
  try {
    const key = projectStorageKey(name, folder);
    const kept = window.localStorage.getItem(key);
    if (kept !== null) return kept;
    for (const spelling of legacySpellings(folder)) {
      const legacy = window.localStorage.getItem(keyFor(name, spelling));
      if (legacy === null) continue;
      try {
        window.localStorage.setItem(key, legacy);
      } catch {
        /* the copy is only a convenience: the value is still returned */
      }
      return legacy;
    }
    return null;
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
