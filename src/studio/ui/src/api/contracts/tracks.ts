export type TrackItem = {
  /** The item's own GUID (REAPER's IGUID), the identity a Link chapters stamp writes to and every LineIdentityLine row is keyed by. */
  guid: string;
  position: number;
  length: number;
  name: string;
  sourceKind: string;
  sourceFile: string;
  sourceAvailable: boolean;
  supported: boolean;
  /** The active take's GUID. */
  takeGuid: string;
  /**
   * Where the item starts in `sourceFile`, in source seconds (a trimmed section's start plus SOFFS). The item plays
   * `length * playRate` seconds of source from here, not the whole file from 0.
   */
  sourceStart: number;
  /** The take's play rate; 1 when the project sets none. */
  playRate: number;
};

export type Track = {
  guid: string;
  index: number;
  name: string;
  color: string;
  muted: boolean;
  soloed: boolean;
  items: TrackItem[];
  /** How many folders the track sits inside; 0 at the top level and in a DAW with no folders. */
  depth: number;
  /** True for a folder parent. The children are the tracks after it with a greater depth. */
  isFolder: boolean;
};

export type TracksProject = {
  path: string;
  tracks: Track[];
};

/** Where `TracksLive`'s tracks came from: REAPER's track list now (`live`), or the saved project file (`saved`). */
export type TracksSource = 'live' | 'saved';

/** Why `TracksLive` answered the saved project: REAPER not connected, not answering, unable to list its tracks, another project (or an unsaved
 * one) open, a bridge script older than the app, more tracks than one read lists, or a read that failed. */
export type TracksSavedReason = 'standalone' | 'not_running' | 'unsupported' | 'other_project' | 'outdated' | 'too_many' | 'failed';

/** The project's tracks as REAPER has them now when REAPER has the linked project open, else the saved file's, with why. A live read keeps each
 * track's items from the saved file; a track added since the save has none yet. `reason` and `message` are empty for a live read. */
export type TracksLive = {
  source: TracksSource;
  reason: TracksSavedReason | '';
  message: string;
  /** When the host read them (RFC 3339). */
  readAt: string;
  project: TracksProject;
};

/** `selected` is empty when more than one .rpp file was found and none has been chosen yet. */
export type TracksDiscovery = {
  candidates: string[];
  selected: string;
};

export interface TracksApi {
  tracksDiscover(): Promise<TracksDiscovery>;
  tracksSelect(path: string): Promise<TracksDiscovery>;
  tracksList(): Promise<TracksProject>;
  /** The tracks REAPER has now, saved or not, when it has the linked project open; otherwise the saved file's, with why. Changes nothing. */
  tracksLive(): Promise<TracksLive>;
  /** Builds a playable URL for a resolved track item source file; synchronous, not a request. */
  mediaUrl(sourceFile: string): string;
}
