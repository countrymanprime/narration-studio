// The narrator's Editing records (ADR 0856), kept in the project's narration-utils/editing/ folder
// (apps/desktop/internal/editlog). This file holds the accepted words: flagged words the narrator kept as read ("It is
// right", "Keep this addition"), so they are no longer flagged. A word is named by its key, `paragraphId:ordinal` (its place
// among the paragraph's whitespace-separated words), together with the text it had; a record whose word changed comes back
// stale, never moved, and a stale word is not accepted: its flag shows again.

export type AcceptedWordStaleReason = 'paragraph_missing' | 'word_missing' | 'text_changed';

export type AcceptedWord = {
  /** `paragraphId:ordinal`, the reader's word key. */
  key: string;
  paragraphId: string;
  /** The word's place among the paragraph's words, from 0. */
  ordinal: number;
  /** The word as it was when accepted. */
  text: string;
  acceptedAt: string;
  /** The line's manuscript index (`ManuscriptParagraph.index`), or null when the line is no longer in the chapter. */
  paragraph: number | null;
  stale: boolean;
  staleReason?: AcceptedWordStaleReason;
};

/** One chapter's accepted words, in reading order. */
export type AcceptedWords = {
  chapterId: string;
  words: AcceptedWord[];
};

/** What an accept or unaccept answers: the chapter's words after the call and the keys it changed (empty when none). */
export type AcceptedWordsChange = AcceptedWords & {
  changed: string[];
};

export interface EditLogApi {
  /** A chapter's accepted words in reading order, each checked against the current manuscript. */
  editingAcceptedList(chapterId: string): Promise<AcceptedWords>;
  /** Accepts words of a chapter. Every key must name a word of its current text, or nothing is saved; a word already
   * accepted is not recorded twice. */
  editingAccept(chapterId: string, keys: string[]): Promise<AcceptedWordsChange>;
  /** Removes words of a chapter from the accepted list, stale ones included, so their flags show again. */
  editingUnaccept(chapterId: string, keys: string[]): Promise<AcceptedWordsChange>;
}
