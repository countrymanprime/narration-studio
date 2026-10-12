// The old script markup layer's span (ADR 0382): stress, pause and character-tag spans on the reader's text. The host no longer reads
// or writes them (marks replaced them, ADR 0792); the type stays for the Booth's side panel, which draws spans until its swap (SNO-10).

export type PrepMarkupKind = 'stress' | 'pause' | 'character_tag';

/** A pause's length: `short` is a breath (one slash), `long` a full pause (two). */
export type PrepMarkupPauseLength = 'short' | 'long';

export type PrepMarkupStaleReason = 'text_changed' | 'paragraph_missing';

export type PrepMarkupSpan = {
  id: string;
  chapterId: string;
  paragraphId: string;
  /** The line's manuscript index (`ManuscriptParagraph.index`), or null when the line is no longer in the chapter. */
  paragraph: number | null;
  /** UTF-16 offsets into the line's text (a JS string index). For a stale span, where it was placed: they may not fit the
   * current line. */
  start: number;
  end: number;
  /** The words the span was placed on. */
  anchorText: string;
  kind: PrepMarkupKind;
  /** The pause length, or the character's name for a tag; empty for stress. */
  value: string;
  /** Where the span starts, counted in non-whitespace characters (how the host tells a whitespace edit from a real one). */
  nonSpaceStart?: number;
  createdAt: string;
  stale: boolean;
  staleReason?: PrepMarkupStaleReason;
};

export type PrepMarkupChapter = { chapterId: string; spans: PrepMarkupSpan[] };
