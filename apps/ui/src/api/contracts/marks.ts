// The Script page's marks: a range of one paragraph marked with one of the narrator's mark types, with an optional note, or a
// question when the type asks. Both lists are kept in the project's narration-utils/marks.json (apps/desktop/internal/marks)
// and each mark is checked against the current text on every read, so a mark whose line is gone, whose range no longer fits
// or whose words changed comes back stale rather than moved (docs/architecture/script-marks.md).

/** The six colours and six line styles a mark type draws with, as in the Studio Next mock. */
export const MARK_COLOURS = ['copper', 'info', 'ok', 'warn', 'bad', 'violet'] as const;
export const MARK_STYLES = ['highlight', 'underline', 'double', 'dotted', 'wavy', 'box'] as const;
export type MarkColour = (typeof MARK_COLOURS)[number];
export type MarkStyle = (typeof MARK_STYLES)[number];

/** The most UTF-16 units a note or question holds, and a mark type's name (a JS string's length). */
export const MARK_TEXT_MAX = 2000;
export const MARK_TYPE_NAME_MAX = 40;

/** One of the narrator's ways of marking up. A type that asks makes its marks questions that track a reply. */
export type MarkType = {
  /** Names the type in each mark. Empty in a save means a new type, which the host names. */
  key: string;
  name: string;
  colour: MarkColour;
  style: MarkStyle;
  asks: boolean;
};

export type MarkStaleReason = 'paragraph_missing' | 'range_out_of_range' | 'text_changed';

/** One reply in a mark's thread. Every thread is empty until the threads slice writes them. */
export type MarkMessage = { who: 'you' | 'author' | 'proofer'; text: string; at: string };

export type Mark = {
  id: string;
  chapterId: string;
  paragraphId: string;
  /** The line's manuscript index (`ManuscriptParagraph.index`), or null when the line is no longer in the chapter. */
  paragraph: number | null;
  /** UTF-16 offsets into the line's text (JS string indexes), start before end. A note brought across from the reader
   * without an anchor has an empty range at the start of its line. For a stale mark, where it was placed. */
  start: number;
  end: number;
  /** The line's own text for the range when the mark was placed. */
  quote: string;
  /** The mark type's key. */
  type: string;
  /** Plain text; may hold line breaks and tabs. A question's text is never empty. */
  text: string;
  /** An asking mark's state; a note has none. */
  status?: 'open' | 'resolved';
  thread: MarkMessage[];
  createdAt: string;
  stale: boolean;
  staleReason?: MarkStaleReason;
};

/** The types in the narrator's order and the marks in reading order (a mark whose line is gone goes last). */
export type Marks = {
  types: MarkType[];
  marks: Mark[];
};

export interface MarksApi {
  /** The types and every mark, each checked against the current manuscript. The first read of a project with no marks file
   * brings the reader's old notes across once, as note marks. */
  marksList(): Promise<Marks>;
  /** Marks a range of one line with a type. The host refuses a range the line lacks and takes the quote from the line; a
   * type that asks needs its question, and its mark starts open. */
  marksAdd(chapterId: string, paragraphId: string, start: number, end: number, type: string, text: string): Promise<Mark>;
  /** Deletes a mark; an id that is not there is not an error. */
  marksRemove(id: string): Promise<Marks>;
  /** Replaces the types, in order; at least one is kept. Removing a type that marks use is refused with the count unless
   * `removeUses` is set, which removes those marks too. A type that now asks opens its marks. */
  marksSaveTypes(types: MarkType[], removeUses: boolean): Promise<Marks>;
}
