/** A toast the recorder saw: its text, and the direction the browser computed for it. */
export type Shown = { text: string; direction: string };

const OPEN = new Set(['\u2066', '\u2067', '\u2068']);
const CLOSE = '\u2069';
// Hebrew, Arabic, Syriac, Thaana, N'Ko and Arabic presentation forms: the letters a right-to-left name is made of.
const RTL_LETTER = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const ENGLISH_LETTER = /[A-Za-z]/;

/** How many isolates are open after `text`. */
function openIsolates(text: string): number {
  let depth = 0;
  for (const char of text) {
    if (OPEN.has(char)) depth += 1;
    else if (char === CLOSE && depth > 0) depth -= 1;
  }
  return depth;
}

/** The text with every isolate (U+2066 to U+2068 \u2026 U+2069), its controls and what it holds removed: what the browser orders with the surrounding words. */
function outsideIsolates(text: string): string {
  let depth = 0;
  let outside = '';
  for (const char of text) {
    if (OPEN.has(char)) depth += 1;
    else if (char === CLOSE && depth > 0) depth -= 1;
    else if (depth === 0) outside += char;
  }
  return outside;
}

/** The names in `names` that stand in `text` outside every isolate: a name the narrator chose belongs inside one. */
export function bareNames(text: string, names: readonly string[]): string[] {
  const bare: string[] = [];
  for (const name of names) {
    for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + name.length)) {
      if (openIsolates(text.slice(0, at)) === 0) bare.push(name);
    }
  }
  return bare;
}

/** The text as a log line: the isolate controls written out, so a CI log shows them (they draw as nothing). */
export function show(text: string): string {
  return JSON.stringify(text).replace(/[\u2066-\u2069]/g, (char) => `\\u${char.charCodeAt(0).toString(16)}`);
}

/**
 * What is wrong with each toast shown, in words. The judge does not ask the app's own rule (`textDirection`, which sets the toast's `dir`), or a regression in it would be agreed with:
 * - the words outside every isolate and outside the names are English, so the toast must be drawn left to right;
 * - a right-to-left letter outside an isolate, among English words, is a name (or a piece of one: a name cut at 60 characters) the builder did not isolate;
 * - one of the names stands outside an isolate.
 * A toast with no English word of its own (a message in a right-to-left language) is left to the app: this sweep is for the app's English sentences.
 * This is stricter than `textDirection` (visibleText.ts keeps `auto` for a mostly right-to-left message that holds "REAPER"): the app's own sentences are English, so an English word
 * in an Arabic-only sentence is not a case the sweep covers, and the judge fails it on purpose (a stated divergence, pinned in the unit test).
 */
export function problems(toasts: readonly Shown[], names: readonly string[]): string[] {
  const found: string[] = [];
  for (const toast of toasts) {
    const outside = outsideIsolates(toast.text);
    const appWords = names.reduce((rest, name) => rest.split(name).join(''), outside);
    if (ENGLISH_LETTER.test(appWords) && toast.direction !== 'ltr')
      found.push(`drawn ${toast.direction} though its own words are English: ${show(toast.text)}`);
    if (ENGLISH_LETTER.test(outside) && RTL_LETTER.test(outside)) found.push(`holds right-to-left letters outside an isolate: ${show(toast.text)}`);
    if (bareNames(toast.text, names).length > 0) found.push(`holds an Arabic name outside an isolate: ${show(toast.text)}`);
  }
  return found;
}
