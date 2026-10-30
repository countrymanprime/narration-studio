// What a project may be called. This mirrors project.ValidateName in src/studio/desktop/internal/project/validate.go, word for word, so
// the New Project dialog and the mock host refuse the names the real host refuses, with the host's own message. Change them together
// (projectName.test.ts holds the cases of the Go fixtures, src/studio/desktop/internal/pathfixtures, that bear on a name).

const INVALID_NAME_CHARS = '<>:"/\\|?*';
// A folder name is at most 255 UTF-16 code units on Windows; a JS string's length counts the same units.
const MAX_NAME_UNITS = 255;
const RESERVED_NAMES = new Set(['CON', 'PRN', 'AUX', 'NUL', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`COM${n}`, `LPT${n}`])]);

/** The host's message for a name it would refuse, or `null` when the name may be used. The name is judged trimmed, as `ProjectCreateIn` does. */
export function projectNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'a project name is required';
  if (trimmed === '.' || trimmed === '..') return `"${trimmed}" is not a valid project name`;
  if ([...trimmed].some((char) => INVALID_NAME_CHARS.includes(char))) return `a project name cannot contain any of ${INVALID_NAME_CHARS}`;
  // eslint-disable-next-line no-control-regex -- the host refuses control characters (below U+0020) by name
  if (/[\u0000-\u001f]/.test(trimmed)) return 'a project name cannot contain control characters';
  if (trimmed.endsWith('.')) return 'a project name cannot end with a period';
  if (trimmed.length > MAX_NAME_UNITS) return `a project name can be at most ${MAX_NAME_UNITS} characters`;
  const dot = trimmed.indexOf('.');
  const base = (dot >= 0 ? trimmed.slice(0, dot) : trimmed).replace(/ +$/, '');
  if (RESERVED_NAMES.has(base.toUpperCase())) return `"${trimmed}" is a reserved name and cannot be used`;
  return null;
}
