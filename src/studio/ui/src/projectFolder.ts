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

const keyFor = (name: string, folder: string): string => `narration.${name}.${folder}`;

/** The browser-storage key of what `name` (for example `booth.lastPlace`) keeps for this project: the normalised folder, so one folder spelled two ways is one place. */
export const projectStorageKey = (name: string, folder: string): string => keyFor(name, folderKey(folder));

/**
 * Reads what `name` keeps for this project. A value under the normalised key wins. Failing that, the value an earlier build wrote under the folder exactly as the caller spells it is
 * copied to the normalised key (the old key is left alone) and returned. Null when storage is blocked or holds nothing; never throws.
 */
export function readProjectStorage(name: string, folder: string): string | null {
  try {
    const key = projectStorageKey(name, folder);
    const kept = window.localStorage.getItem(key);
    if (kept !== null) return kept;
    const legacyKey = keyFor(name, folder);
    if (legacyKey === key) return null;
    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy === null) return null;
    try {
      window.localStorage.setItem(key, legacy);
    } catch {
      /* the copy is only a convenience: the value is still returned */
    }
    return legacy;
  } catch {
    return null;
  }
}

/** Keeps `value` for this project under the normalised key. False when storage refused it (blocked or full). */
export function writeProjectStorage(name: string, folder: string, value: string): boolean {
  try {
    window.localStorage.setItem(projectStorageKey(name, folder), value);
    return true;
  } catch {
    return false;
  }
}
