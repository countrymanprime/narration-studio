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

/** `selected` is empty when more than one .rpp file was found and none has been chosen yet. */
export type TracksDiscovery = {
  candidates: string[];
  selected: string;
};

export interface TracksApi {
  tracksDiscover(): Promise<TracksDiscovery>;
  tracksSelect(path: string): Promise<TracksDiscovery>;
  tracksList(): Promise<TracksProject>;
  /** Builds a playable URL for a resolved track item source file; synchronous, not a request. */
  mediaUrl(sourceFile: string): string;
}
