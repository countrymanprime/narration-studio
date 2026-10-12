// The pickup list: import a proofer's CSV, jump to the next open
// pickup, resolve or reopen it, list every pickup marker, export the remaining list. Mirrors apps/desktop/internal/pickups.Service.Snapshot() exactly:
// one run (import, export, jump, resolve, reopen, list or count) at a time, reported by phase, with remaining/total surviving
// between runs so the count does not flash back to zero while a different action is in flight.

export type PickupsPhase = 'idle' | 'importing' | 'exporting' | 'jumping' | 'resolving' | 'reopening' | 'listing' | 'counting' | 'success' | 'error';

/** Whether a pickup marker in the DAW is still to record (`PICKUP:`) or done (`PICKUP_DONE:`). */
export const PICKUP_MARKER_STATES = ['open', 'done'] as const;
export type PickupMarkerState = (typeof PICKUP_MARKER_STATES)[number];

/** One pickup marker as the DAW holds it (SN-D44): its project time in seconds, open or done, its optional tag, and its note.
 * The DAW's marker name is the truth for whether a pickup is done. */
export type PickupMarker = {
  start: number;
  state: PickupMarkerState;
  tag: string;
  note: string;
};

/** One pickup the narrator jumped to, or resolved: the marker's project time in seconds, its optional tag, and its note. */
export type PickupsMoment = {
  position: number;
  tag: string;
  note: string;
};

/** What the last Import run found, once REAPER answers: how many markers it actually added, how many were
 * already there (idempotent re-import), and how many payload rows Lua itself rejected (Go already validates
 * every row before sending, so this is normally 0, but the same defensiveness as everywhere else on this wire
 * applies here too). */
export type PickupsImportReport = {
  added: number;
  existing: number;
  invalid: number;
};

export type PickupsState = {
  runId?: string;
  phase: PickupsPhase;
  message: string;
  /** How many pickups are still open, and how many exist in total (open plus resolved); from the last Count. */
  remaining: number;
  total: number;
  /** Set after a successful Next. */
  next?: PickupsMoment;
  /** Set after a successful Resolve. */
  resolved?: PickupsMoment;
  /** Set after a successful Import. */
  importReport?: PickupsImportReport;
  /** The remaining pickups, as CSV text (header start,note,tag); set after a successful Export, ready to
   * offer as a download with no second round trip. */
  csv: string;
  /** Every pickup marker in the DAW, open and done, in position order; set after a successful ListMarkers, empty otherwise.
   * The host always sends it and the schema requires it; it is optional here only so a state the UI builds itself (the
   * Pickups page's own idle state) needs no edit. */
  markers?: PickupMarker[];
};

/** PickupsImport's answer: the run has started, plus every CSV row Go could not use (line number and why),
 * reported rather than silently dropped. */
export type PickupsImportResult = {
  status: 'started';
  rowErrors: string[];
};

export type PickupsStartResult = { status: 'started' };

/**
 * "Punch from here" on a pickup (`PickupsPunch`): a pickup marker's own project
 * time is already known, so unlike the teleprompter's punch this needs no word-to-time resolution. `punched` carries
 * `cursor`, where REAPER's edit cursor landed; `refused` carries `message`, and nothing moved.
 */
export type PickupsPunchResult = {
  outcome: 'punched' | 'refused';
  cursor?: number;
  message?: string;
};

/** Where a pickup on the host's list came from (ADR 0840): a gap of the recording check, a note decided "Needs pickup", the
 * same decision on a note that is a sound, or a line the narrator added. */
export const PICKUP_SOURCES = ['speech', 'proof', 'audio', 'you'] as const;
export type PickupSource = (typeof PICKUP_SOURCES)[number];

/** What a recording check found in the read part of a chapter (ADR 0830). */
export const PICKUP_GAP_KINDS = ['missing', 'extra', 'misread', 'other'] as const;
export type PickupGapKind = (typeof PICKUP_GAP_KINDS)[number];

/** One line of the host's pickup list (`PickupsList`). */
export type PickupItem = {
  /** Stable across listings: `speech:<chapter>:<gap>`, `finding:<id>` or `you:<hash>`. */
  id: string;
  chapterId: string;
  paragraphId: string | null;
  /** The line's index in the manuscript, or null when the pickup names no line that is still there. */
  paragraph: number | null;
  /** Seconds into the chapter's recording, or null when the source gave none. */
  time: number | null;
  /** Where the pickup's DAW marker is or would be, in project seconds, or null when the host cannot place it. */
  at: number | null;
  /** The gap kind for a speech pickup, the note's type for proof and audio, `misread` for a line added by hand. */
  type: string;
  gap?: PickupGapKind;
  script: string;
  context: string;
  source: PickupSource;
  /** The source's own number, or null; `confReason` says why when it is null. */
  confidence: number | null;
  confReason: string;
  /** The note the pickup came from, or the one an accepted gap became. */
  findingId?: string;
  /** In the next session, unless the narrator left it out. */
  included: boolean;
  done: boolean;
  /** The done state is the app's and has not been written to the DAW's marker yet. */
  waiting: boolean;
};

/** A chapter whose recording check added no pickups: `state` is never, stale or why it could not be read. */
export type PickupLeftOutChapter = {
  chapterId: string;
  state: string;
  reasons: string[];
};

/** The host's pickup list: every binding that changes it answers the whole list. */
export type PickupList = {
  pickups: PickupItem[];
  leftOut: PickupLeftOutChapter[];
};

export interface PickupsApi {
  /** Parses and validates csvText (columns start,note,tag; an optional header row) in Go and, if any row is
   * usable, writes the payload and asks REAPER to import it. Throws when every row is unusable. */
  pickupsImport(csvText: string): Promise<PickupsImportResult>;
  /** Asks REAPER for every remaining pickup; read-only. */
  pickupsExport(): Promise<PickupsStartResult>;
  /** Moves the edit cursor to the next open pickup after the cursor, wrapping to the earliest one. */
  pickupsNext(): Promise<PickupsStartResult>;
  /** Marks the open pickup nearest position (seconds) as done. */
  pickupsResolve(position: number): Promise<PickupsStartResult>;
  /** Puts the resolved pickup nearest position (seconds) back to open. A negative or non-finite position is refused. */
  pickupsReopen(position: number): Promise<PickupsStartResult>;
  /** Asks REAPER for every pickup marker, open or done; read-only. The markers arrive in the state's `markers`. */
  pickupsListMarkers(): Promise<PickupsStartResult>;
  /** Asks REAPER how many pickups remain versus the total; read-only. */
  pickupsCount(): Promise<PickupsStartResult>;
  pickupsState(): Promise<PickupsState>;
  subscribePickups(onUpdate: (state: PickupsState) => void): () => void;
  /** Move REAPER's edit cursor to `position` (a pickup's own project time) minus the punch pre-roll setting. */
  pickupsPunch(position: number): Promise<PickupsPunchResult>;
  /** The merged pickup list (ADR 0840). With the DAW answering, done states that waited are written to the markers first. */
  pickupsList(): Promise<PickupList>;
  /** Adds a line by hand at `time` seconds into the chapter's recording. Refuses an empty line, a line over 500 characters or
   * with control characters, an unknown chapter and a time outside the chapter. The same line twice is one pickup. */
  pickupsAdd(chapterId: string, time: number, line: string): Promise<PickupList>;
  /** Hides a pickup of any source from the list. */
  pickupsRemove(id: string): Promise<PickupList>;
  /** Puts a pickup in or leaves it out of the next session. */
  pickupsSetIncluded(id: string, included: boolean): Promise<PickupList>;
  /** Marks a pickup done or open: through its DAW marker when the DAW holds it (a refusal throws), otherwise kept until it can be. */
  pickupsSetDone(id: string, done: boolean): Promise<PickupList>;
}
