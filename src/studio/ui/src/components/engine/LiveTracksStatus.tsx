import { useSecondsSince } from '../layout/CheckLine';
import { IconButton } from '../primitives/IconButton';
import type { LiveTracks } from './useLiveTracks';

/** The sentence that says whose tracks these are: REAPER's now, the saved project's and why, or a read that has gone quiet. */
export function liveTracksSentence(live: LiveTracks): string {
  if (live.readAt === null) return live.busy ? 'Reading the tracks from REAPER…' : 'The tracks have not been read yet.';
  if (live.stale) return 'Can’t tell whether these are REAPER’s tracks now.';
  if (live.source === 'live') return 'REAPER’s tracks now, saved or not.';
  return live.message || 'The tracks in the saved project.';
}

/**
 * Where the engine panel's tracks came from and when they were last read, with the Refresh that reads them again (#2840). It holds the same
 * one line in every state, so a read that fails or answers never moves what is under it; a failed read itself is a toast (useLiveTracks).
 * Only the sentence is announced: the seconds tick every second and are not.
 */
export function LiveTracksStatus({ live, className = '' }: { live: LiveTracks; className?: string }) {
  const seconds = useSecondsSince(live.readAt);
  return (
    <span className={`inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 ${className}`}>
      <span role="status">{liveTracksSentence(live)}</span>
      {seconds !== null && <span>{live.stale ? `Last read ${seconds} s ago.` : `Read ${seconds} s ago.`}</span>}
    </span>
  );
}

/** Reads the tracks from REAPER again now: a track or folder added there since the last read shows. */
export function LiveTracksRefresh({ live }: { live: LiveTracks }) {
  return <IconButton action="retry" label="Read the tracks from REAPER again" size="sm" pending={live.refreshing} onClick={live.refresh} />;
}
