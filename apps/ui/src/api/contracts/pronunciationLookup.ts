/**
 * The four web pronunciation lookup sites (Go: `apps/desktop/internal/pronunciationlookup`; the `BrowserLookup`
 * role in `docs/architecture/provider-ports.md`). Each value is the source id `PronunciationLookupOpen` takes, matching `pronunciationlookup.Source` on the
 * Go side one for one.
 */
export type PronunciationLookupSource = 'forvo' | 'youglish' | 'merriam_webster' | 'howjsay';

export interface PronunciationLookupApi {
  /**
   * Opens source's fixed lookup-page template for word in the narrator's default browser, and nothing else - the
   * app never fetches, scrapes or caches the site itself. source and
   * word cross the boundary, never a URL: the destination is always built server-side from one of four hardcoded
   * templates, so nothing this call passes can pick an arbitrary destination.
   */
  pronunciationLookupOpen(source: PronunciationLookupSource, word: string): Promise<void>;
}
