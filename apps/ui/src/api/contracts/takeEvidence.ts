/**
 * The evidence for each take of a passage (Go: `apps/desktop/internal/passagetakes/evidence.go`, bound as
 * `WorkspaceTakeEvidence` in `apps/desktop/bindings_workspace_takes.go`; ADR 0140). One entry per take `workspaceTakes`
 * offers for the same passage, in its order and with its ids. Every figure is a value or a sentence saying why there is
 * none, never a default. The call reads only and takes a chapter id and token indexes; the answer holds ids and numbers.
 */

/** One figure: measured, or the reason it was not. */
export type TakeFigure = { ok: true; value: number } | { ok: false; reason: string };

/** What a take's own source range measures. `clarity` has no host measure and is always `{ ok: false, reason: 'Not measured' }`. */
export interface TakeEvidenceMeasure {
  /** The longest pause between speech, seconds. */
  pause: TakeFigure;
  /** Average level (RMS) and noise floor, dBFS, to 0.1 dB. */
  rms: TakeFigure;
  nf: TakeFigure;
  clarity: TakeFigure;
  /** Breaths in the take. */
  breaths: TakeFigure;
}

/** Where the passage's place in time came from: the Booth's passage map, or the audio matched to the text afterwards. */
export type TakePlacement = 'map' | 'aligned';

export interface TakeEvidence {
  /** The candidate id `workspaceTakes` offered, the one `workspaceUseTake` takes back. */
  id: string;
  /** Percent of the passage's script words the take read as written, from the stored alignment of its range. */
  matched: TakeFigure;
  measure: TakeEvidenceMeasure;
  /** `map` for a take the Booth's passage map stamped over the passage, `aligned` for one recorded elsewhere. */
  via: TakePlacement;
}

export interface TakeEvidenceResult {
  chapterId: string;
  firstToken: number;
  lastToken: number;
  /** The passage snapped out to whole paragraphs, as `workspaceTakes` snaps it. */
  firstParagraph: number;
  lastParagraph: number;
  /** Why there are no takes, when there are none. */
  message?: string;
  takes: TakeEvidence[];
}

export interface TakeEvidenceApi {
  /** Refuses a chapter or token range with the sentence `workspaceTakes` gives for it. */
  workspaceTakeEvidence(chapterId: string, firstToken: number, lastToken: number): Promise<TakeEvidenceResult>;
}
