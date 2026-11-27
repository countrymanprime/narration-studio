import type { Page } from '@playwright/test';

// The mock build's names, swapped for long Arabic ones as the page loads (#4129): the mock has no option to rename its chapters, tracks,
// characters or microphones, and every toast that carries one of them is a sentence the narrator reads, so the sweep
// (toast-rtl-sweep.spec.ts) runs on this data. The swap is made on the served bundle (`page.route`), not in the repo's fixtures: the
// fixtures stay what the rest of the suite measures, and the names are in the page, not in a test's string.
// Each Arabic name is 20 letters or more, so a toast whose builder forgot to isolate one has more right-to-left letters than the
// English words round it. Written as escapes: no right-to-left character stands in this file.

/** The chapters renamed, by the number the mock gives them: the title a toast names ("Chapter 4 moved to Editing.") is this one. */
export const CHAPTER_TITLES = {
  1: '\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644 \u062C\u062D\u0631 \u0627\u0644\u0623\u0631\u0646\u0628 \u0627\u0644\u0639\u0645\u064A\u0642',
  2: '\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062B\u0627\u0646\u064A \u0628\u0631\u0643\u0629 \u0627\u0644\u062F\u0645\u0648\u0639 \u0627\u0644\u0643\u0628\u064A\u0631\u0629',
  4: '\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0631\u0627\u0628\u0639 \u0627\u0644\u0623\u0631\u0646\u0628 \u064A\u0631\u0633\u0644 \u0628\u064A\u0644 \u0627\u0644\u0635\u063A\u064A\u0631',
} as const;

/** Other names in the bundle, and what the sweep puts in their place. */
export const ARABIC_NAMES = {
  'White Rabbit': '\u0627\u0644\u0623\u0631\u0646\u0628 \u0627\u0644\u0623\u0628\u064A\u0636 \u0627\u0644\u0645\u062A\u0623\u062E\u0631',
  'Cheshire Cat': '\u0642\u0637 \u062A\u0634\u064A\u0634\u0627\u064A\u0631 \u0627\u0644\u0645\u0628\u062A\u0633\u0645',
  'Chapter 1 Narration': '\u0631\u0627\u0648\u064A \u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644 \u0627\u0644\u0637\u0648\u064A\u0644',
  'Microphone Array (Realtek(R) Audio)':
    '\u0645\u064A\u0643\u0631\u0648\u0641\u0648\u0646 \u0627\u0644\u0645\u0643\u062A\u0628 \u0627\u0644\u0631\u0626\u064A\u0633\u064A (Realtek)',
} as const;

/** A microphone the narrator chose that the recorder no longer lists (put in the page's storage, not in the bundle). */
export const MISSING_MICROPHONE =
  '\u0645\u064A\u0643\u0631\u0648\u0641\u0648\u0646 \u0627\u0644\u0633\u0645\u0627\u0639\u0629 \u0627\u0644\u0644\u0627\u0633\u0644\u0643\u064A\u0629 \u0627\u0644\u0642\u062F\u064A\u0645\u0629 \u0627\u0644\u062A\u064A \u0644\u0645 \u062A\u0639\u062F \u0645\u0648\u062C\u0648\u062F\u0629';

/** Every Arabic name the sweep puts in the page, longest first (a name that holds another is looked for first). */
export const ARABIC_VALUES: readonly string[] = [...Object.values(CHAPTER_TITLES), ...Object.values(ARABIC_NAMES), MISSING_MICROPHONE].sort(
  (a, b) => b.length - a.length,
);

/** The chunk with its mock names swapped for Arabic ones, and the English patterns that matched nothing (a rename that silently stopped working). */
export function swapNames(source: string): { body: string; unmatched: string[] } {
  let body = source;
  const unmatched: string[] = [];
  const swap = (pattern: string, replacement: string) => {
    if (!body.includes(pattern)) unmatched.push(pattern);
    body = body.split(pattern).join(replacement);
  };
  for (const [number, title] of Object.entries(CHAPTER_TITLES)) swap(`title:\`Chapter ${number}\``, `title:\`${title}\``);
  for (const [english, arabic] of Object.entries(ARABIC_NAMES)) swap(english, arabic);
  // The REAPER mock's track for Chapter 1 (mockFixtures.ts) takes the chapter's own title, so the mock still pairs them by name; "Chapter 1" is the track a Chapter links toast quotes.
  swap('name:`Chapter 1`', `name:\`${CHAPTER_TITLES[1]}\``);
  return { body, unmatched };
}

/**
 * Serves the app's own script with its mock names swapped for Arabic ones, for every page this `page` loads.
 * Only the app's chunk is rewritten (`index-*.js`): the manuscript's text chunk keeps the book as published.
 * A pattern the chunk no longer holds (the minifier printed it another way, the mock moved) fails the load, so a rename never stops silently.
 */
export async function arabicNames(page: Page): Promise<void> {
  await page.route(/\/assets\/index-[^/]*\.js$/, async (route) => {
    const response = await route.fetch();
    const { body, unmatched } = swapNames(await response.text());
    if (unmatched.length > 0) {
      await route.abort();
      throw new Error(`arabicNames: the app chunk no longer holds ${JSON.stringify(unmatched)}`);
    }
    await route.fulfill({ response, body });
  });
}

/** A cell that starts with this title (the shared board drivers match an English "Chapter 4" with a `\b` that an Arabic title has none of). */
export const startsWithTitle = (title: string): RegExp => new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
