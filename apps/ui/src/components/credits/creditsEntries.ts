// The opening and closing credits as the pages with a chapter list draw them: one entry per kind the template library has, in the place the
// mock puts them (opening before chapter 1, closing after the last). The Script list, Production's pipeline, Proof's strip and Delivery's
// "Before you build" all read this one answer, so a page cannot list a credits file another leaves out (issue 1705). The rows are the ones
// `useCreditsRows` reads; which of them are drawn, and their Prepped dot, is `creditsRows`'s rule, shared with the Script page.

import type { ChapterStatus } from '../../api/contracts/manuscript';
import type { PrepState } from '../../api/contracts/scriptPrep';
import type { RecordedUnavailable } from '../../types';
import { creditsRows } from './creditsRows';
import type { CreditsKind, CreditsRow } from './useCreditsRows';

/** The synthetic chapter id of each credits file: the one the recording check, the Script anchors and the Booth already use (ADR 0333). */
export const CREDITS_ID: Record<CreditsKind, string> = { opening: 'credits-opening', closing: 'credits-closing' };
export const CREDITS_NAME: Record<CreditsKind, string> = { opening: 'Opening credits', closing: 'Closing credits' };

/** The kind a credits id names, or undefined for anything else (a chapter id). */
export function creditsKindOfId(id: string): CreditsKind | undefined {
  return id === CREDITS_ID.opening ? 'opening' : id === CREDITS_ID.closing ? 'closing' : undefined;
}

/**
 * The two credits files as chapters, for the rule that pairs a measured file with its chapter by name (`master/chapterFile.ts`): a file
 * called "Opening credits.wav" is the opening credits'. `index` is below any real chapter's, so no "Chapter 04.wav" number can match one.
 */
export const CREDITS_FILE_CHAPTERS: readonly { id: string; title: string; index: number }[] = [
  { id: CREDITS_ID.opening, title: CREDITS_NAME.opening, index: -2 },
  { id: CREDITS_ID.closing, title: CREDITS_NAME.closing, index: -2 },
];

export type CreditsEntry = {
  kind: CreditsKind;
  id: string;
  name: string;
  /** Prepped once the preview has no [Token] left to fill in, else none (`creditsRows`). */
  prep: PrepState;
  status: ChapterStatus;
  words: number;
  recordedSeconds?: number;
  recordedUnavailable?: RecordedUnavailable;
};

/**
 * The credits entries to draw. `ownsOpening` is true when the manuscript imported its own opening-credits chapter: that chapter stands in
 * for the opening entry, as on the Script page. Empty until the rows are read, or when reading them failed.
 */
export function creditsEntries(rows: Record<CreditsKind, CreditsRow> | undefined, ownsOpening: boolean): { opening?: CreditsEntry; closing?: CreditsEntry } {
  if (!rows) return {};
  const drawn = creditsRows({
    hasOpening: Boolean(rows.opening.template),
    hasClosing: Boolean(rows.closing.template),
    ownsOpening,
    previews: { opening: rows.opening.preview, closing: rows.closing.preview },
  });
  const entry = (kind: CreditsKind): CreditsEntry | undefined => {
    const shown = drawn[kind];
    if (!shown) return undefined;
    const row = rows[kind];
    return {
      kind,
      id: CREDITS_ID[kind],
      name: CREDITS_NAME[kind],
      prep: shown.state,
      status: row.status,
      words: row.words ?? 0,
      ...(row.recordedSeconds !== undefined ? { recordedSeconds: row.recordedSeconds } : {}),
      ...(row.recordedUnavailable ? { recordedUnavailable: row.recordedUnavailable } : {}),
    };
  };
  return { opening: entry('opening'), closing: entry('closing') };
}
