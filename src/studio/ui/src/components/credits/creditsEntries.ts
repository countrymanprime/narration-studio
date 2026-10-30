// The ids of the two credits chapters. The credits are chapters of the host's list (`manuscriptChapters`, marked `isCredits`), so a page
// reads their title, status, words and recorded length from that list; this file only names them for a link that carries a credits kind.

import type { CreditsKind } from './useCreditsRows';

/** The chapter id of each credits file: the one the recording check, the Script anchors and the Booth use. */
export const CREDITS_ID: Record<CreditsKind, string> = { opening: 'credits-opening', closing: 'credits-closing' };

/** The kind a credits chapter id names, or undefined for anything else (a manuscript chapter's id). */
export function creditsKindOfId(id: string): CreditsKind | undefined {
  return id === CREDITS_ID.opening ? 'opening' : id === CREDITS_ID.closing ? 'closing' : undefined;
}
