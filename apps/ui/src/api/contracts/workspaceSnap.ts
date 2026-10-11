/**
 * A cut point moved to the nearest zero crossing (ADR 0855's snap rule), host-side: apps/desktop/bindings_workspace_snap.go
 * over apps/desktop/internal/zerocross. The page sends a chapter id, an item GUID and a time in that item's source; the
 * host finds the file and reads only the 2 ms either side.
 */

/** Why a cut did not move: no checked track, an item the project no longer has, no audio there (a missing file, not a
 * WAV, past its end), a silent window, or one with no crossing within 2 ms. */
export type WorkspaceSnapRefusal = 'no_track' | 'stale' | 'no_audio' | 'silent' | 'no_crossing';

/** `snapped`: `time` is on the nearest crossing and `moved` is `time - sourceTime` (signed, within 2 ms; 0 on a crossing).
 * `refused`: `time` is `sourceTime`, `moved` is 0, and `reason` and `message` say why. Times are seconds of the item's source. */
export type WorkspaceSnapResult = {
  chapterId: string;
  itemGuid: string;
  sourceTime: number;
  time: number;
  moved: number;
} & ({ outcome: 'snapped' } | { outcome: 'refused'; reason: WorkspaceSnapRefusal; message: string });

export interface WorkspaceSnapApi {
  /** Moves a cut in an item's source to the nearest zero crossing within 2 ms, or says why it stays. */
  workspaceSnap(chapterId: string, itemGuid: string, sourceTime: number): Promise<WorkspaceSnapResult>;
}
