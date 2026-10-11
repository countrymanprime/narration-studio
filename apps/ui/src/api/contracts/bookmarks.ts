// The narrator's bookmarks (ADR 0820): a spot in the manuscript, a paragraph and a character offset in its text, with an
// optional label and note, kept in the project's narration-utils/bookmarks.json (apps/desktop/internal/bookmarks) and checked
// against the current text on every read, so a bookmark whose line is gone or whose offset no longer fits comes back stale
// rather than moved.

/** The most UTF-16 units a label and a note hold (a JS string's length). */
export const BOOKMARK_LABEL_MAX = 60;
export const BOOKMARK_NOTE_MAX = 500;

export type BookmarkStaleReason = 'paragraph_missing' | 'offset_out_of_range';

export type Bookmark = {
  id: string;
  chapterId: string;
  paragraphId: string;
  /** The line's manuscript index (`ManuscriptParagraph.index`), or null when the line is no longer in the chapter. */
  paragraph: number | null;
  /** A UTF-16 offset into the line's text (a JS string index), from 0 to its length. For a stale bookmark, where it was
   * placed: it may not fit the current line. */
  offset: number;
  /** Plain text, one line; empty when the narrator has not named it. */
  label: string;
  /** Plain text; may hold line breaks and tabs. */
  note: string;
  createdAt: string;
  stale: boolean;
  staleReason?: BookmarkStaleReason;
};

export interface BookmarksApi {
  /** Every bookmark in reading order, each checked against the current manuscript. */
  bookmarksList(): Promise<Bookmark[]>;
  /** Bookmarks a spot. A spot that already has a bookmark is not marked twice: that bookmark is returned. */
  bookmarksAdd(chapterId: string, paragraphId: string, offset: number): Promise<Bookmark>;
  /** Replaces a bookmark's label and note; both are trimmed, and text over the limits or with control characters is refused. */
  bookmarksUpdate(id: string, label: string, note: string): Promise<Bookmark>;
  /** Deletes a bookmark by id and returns the bookmarks left, in reading order. An id that is not there is not an error. */
  bookmarksRemove(id: string): Promise<Bookmark[]>;
}
