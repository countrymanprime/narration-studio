// Where the credits sit in the Script page's chapter list, as the mock's fixture orders them: "Opening credits" before the first chapter and
// "Closing credits" after the last (`docs/research/mockups/studio-next/src/fixtures/alice.ts`). The reader draws the cards in the same places.
// Whether each is drawn is the host's chapter list's answer (`isCredits` entries); this file holds only their ids on the page.

import type { CreditsKind } from '../booth/readerModel';

/** The roving list's ids for the credits rows, which no chapter's id can be. */
export const CREDITS_STOP: Record<CreditsKind, string> = { opening: 'credits:opening', closing: 'credits:closing' };

/** The chapter list's stops in order: the opening credits (when drawn), every chapter, then the closing credits (when drawn). */
export function chapterListStops(chapterIds: readonly string[], drawn: { opening?: unknown; closing?: unknown }): string[] {
  return [...(drawn.opening ? [CREDITS_STOP.opening] : []), ...chapterIds, ...(drawn.closing ? [CREDITS_STOP.closing] : [])];
}
