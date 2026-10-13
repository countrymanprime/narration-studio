// Where the credits sit in the Script page's chapter list, as the mock's fixture orders them: "Opening credits" before the first chapter and
// "Closing credits" after the last (`docs/research/mockups/studio-next/src/fixtures/alice.ts`). The reader draws the cards in the same places.

import type { CreditsRenderResult } from '../../../../api/contracts/credits';
import type { PrepState } from '../../../../api/contracts/scriptPrep';
import type { CreditsKind } from '../../../booth/readerModel';

/** The roving list's ids for the credits rows, which no chapter's id can be. */
export const CREDITS_STOP: Record<CreditsKind, string> = { opening: 'credits:opening', closing: 'credits:closing' };

/** The chapter list's stops in order: the opening credits (when drawn), every chapter, then the closing credits (when drawn). */
export function chapterListStops(chapterIds: readonly string[], drawn: { opening?: unknown; closing?: unknown }): string[] {
  return [...(drawn.opening ? [CREDITS_STOP.opening] : []), ...chapterIds, ...(drawn.closing ? [CREDITS_STOP.closing] : [])];
}

/**
 * The credits rows the chapter list draws: one per kind the template library has. A manuscript that imported its own opening-credits
 * chapter lists that chapter instead of the opening row; no manuscript chapter stands in for the closing credits. A row has no prep
 * state of its own: its dot is Prepped once its preview has no [Token] left to fill in, else Not started.
 */
export function creditsRows(input: {
  hasOpening: boolean;
  hasClosing: boolean;
  ownsOpening: boolean;
  previews: { opening?: CreditsRenderResult; closing?: CreditsRenderResult };
}): { opening?: { state: PrepState }; closing?: { state: PrepState } } {
  const state = (preview: CreditsRenderResult | undefined): PrepState => (preview?.unresolved.length === 0 ? 'prepped' : 'none');
  return {
    ...(input.hasOpening && !input.ownsOpening ? { opening: { state: state(input.previews.opening) } } : {}),
    ...(input.hasClosing ? { closing: { state: state(input.previews.closing) } } : {}),
  };
}
