// The Script page's address: `/script?find=<text>` opens the Find bar with that text (the Story Bible's Find button, SN-B92, opens it).
// Chapters and paragraphs are the hash's (`layout/useDeepLink.ts`); the query holds only what the page is asked to search for.

/** The address that opens Find on `text`, relative to `/script`. */
export function findQuery(text: string): string {
  return `?find=${encodeURIComponent(text)}`;
}

/** The text an address asks Find to open on, or null when it asks for none (an absent or blank `find`). */
export function readFindQuery(params: URLSearchParams): string | null {
  const text = params.get('find');
  return text && text.trim() !== '' ? text : null;
}
