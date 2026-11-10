import { useToasts } from '../../hooks/useToasts';
import { plural } from '../../plural';
import { useSecondsSince } from '../layout/CheckLine';
import { IconButton } from '../primitives/IconButton';
import { TooltipTarget } from '../primitives/Tooltip';
import type { LiveTracks } from './useLiveTracks';

type Line = {
  /** What a screen reader is told when the state changes, with no ticking seconds. */
  announce: string;
  /** The one short line drawn in the header. */
  short: string;
  /** The whole sentence, the short line's hint. */
  full: string;
};

/** Whose tracks these are and when they were read: REAPER's now, the saved project's and why, or a read that has gone quiet. */
function liveTracksLine(live: LiveTracks, seconds: number | null): Line {
  const ago = seconds === null ? '' : ` ${live.stale ? 'Last read' : 'Read'} ${seconds} s ago.`;
  const line = (announce: string, short: string): Line => ({ announce, short, full: `${announce}${ago}` });
  if (live.readAt === null) {
    if (live.error) return line(`The tracks could not be read: ${live.error}`, 'Tracks not read yet');
    return live.busy ? line('Reading the tracks from REAPER…', 'Reading tracks…') : line('The tracks have not been read yet.', 'Tracks not read yet');
  }
  if (live.stale) return line(`Can’t tell whether these are REAPER’s tracks now: ${live.error}`, `REAPER did not answer · last read ${seconds} s ago`);
  if (live.source === 'live') return line('REAPER’s tracks now, saved or not.', `REAPER now · read ${seconds} s ago`);
  return line(live.message || 'The tracks in the saved project.', `Saved project · read ${seconds} s ago`);
}

/**
 * Where the engine panel's tracks came from and when they were last read (#2840). One short line in every state and at every width, cut
 * with an ellipsis, so a read that fails or answers never changes the header's height; the whole sentence is its hint. A screen reader is
 * told the sentence when it changes, never the ticking seconds. A failed read itself is a toast (useLiveTracks).
 */
export function LiveTracksStatus({ live }: { live: LiveTracks }) {
  const seconds = useSecondsSince(live.readAt);
  const { announce, short, full } = liveTracksLine(live, seconds);
  return (
    <>
      <span role="status" className="sr-only">
        {announce}
      </span>
      <TooltipTarget text={full} className="block! max-w-full min-w-0">
        <span aria-hidden="true" className="block truncate whitespace-nowrap">
          {short}
        </span>
      </TooltipTarget>
    </>
  );
}

/**
 * Reads the tracks from REAPER again now: a track or folder added there since the last read shows. Its hint is IconButton's own. A press answers
 * with a toast even when nothing changed, since only "read N s ago" in the truncated status moved (#3339); a failed read's own toast says so, so a
 * failure adds none.
 */
export function LiveTracksRefresh({ live }: { live: LiveTracks }) {
  const { notify } = useToasts();
  const press = () =>
    void live.recheck().then(({ project, source, failed }) => {
      if (failed || !project) return;
      const count = project.tracks.length;
      notify(source === 'live' ? `Read ${plural(count, 'track')} from REAPER.` : 'Read the tracks in the saved project.');
    });
  return <IconButton action="retry" label="Read the tracks from REAPER again" size="sm" pending={live.refreshing} onClick={press} />;
}
