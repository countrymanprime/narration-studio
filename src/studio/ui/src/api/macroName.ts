// The host's rule for an Audacity macro name (audacitybridge.CheckMacroName in Go): the approval dialog checks a name with it before
// it sends one, and the mock refuses with it, so neither asks the host to run a name it cannot. Its verdicts are tested against
// the host's own, pinned in tests/fixtures/contracts/macro-names.json.

/** The characters a macro name may hold, for the field's hint. */
export const MACRO_NAME_CHARACTERS = 'letters, digits, spaces, hyphens and underscores';

/** The most characters a name may have besides its spaces (Audacity's id for the macro is the name with its spaces taken out). */
const MACRO_ID_MAX = 64;

/** Why the host would refuse `name` as a macro name, or undefined when it can run it. */
export function macroNameProblem(name: string): string | undefined {
  let id = 0;
  for (const char of name) {
    if (char === ' ') continue;
    if (!/^[A-Za-z0-9_-]$/.test(char)) return `A macro name can hold only ${MACRO_NAME_CHARACTERS}.`;
    id += 1;
  }
  if (id === 0) return 'Name the macro to apply.';
  if (id > MACRO_ID_MAX) return `A macro name can have at most ${MACRO_ID_MAX} characters besides its spaces.`;
  return undefined;
}
