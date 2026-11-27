import { textDirection } from '../../../src/visibleText';

/** A toast the recorder saw: its text, and the direction the browser computed for it. */
export type Shown = { text: string; direction: string };

const OPEN = new Set(['\u2066', '\u2067', '\u2068']);
const CLOSE = '\u2069';

/** The names in `names` that stand in `text` outside every isolate (U+2066 to U+2068 \u2026 U+2069): a name the narrator chose belongs inside one. */
export function bareNames(text: string, names: readonly string[]): string[] {
  const bare: string[] = [];
  for (const name of names) {
    for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + name.length)) {
      let depth = 0;
      for (const char of text.slice(0, at)) {
        if (OPEN.has(char)) depth += 1;
        else if (char === CLOSE && depth > 0) depth -= 1;
      }
      if (depth === 0) bare.push(name);
    }
  }
  return bare;
}

/** What is wrong with each toast shown, in words: right to left while its own words are English, or an Arabic name outside an isolate. */
export function problems(toasts: readonly Shown[], names: readonly string[]): string[] {
  const found: string[] = [];
  for (const toast of toasts) {
    if (toast.direction === 'rtl' && textDirection(toast.text) === 'ltr')
      found.push(`drawn right to left though its own words are English: ${JSON.stringify(toast.text)}`);
    if (bareNames(toast.text, names).length > 0) found.push(`holds an Arabic name outside an isolate: ${JSON.stringify(toast.text)}`);
  }
  return found;
}
