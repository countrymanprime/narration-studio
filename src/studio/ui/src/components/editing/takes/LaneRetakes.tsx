import { IconButton } from '../../primitives/IconButton';
import { SectionLabel } from '../../primitives/SectionLabel';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { RetakeLane, RetakeLaneLine } from '../../../api/contracts/retakelanes';
import type { TakesGate } from './types';

export interface LaneRetakesProps {
  line: RetakeLaneLine;
  /** Whether REAPER can be asked now, with its own sentence when it cannot: the pick buttons stay and say why they are off. */
  gate: TakesGate;
  /** The retake being picked now: every other lane waits for REAPER's answer. */
  picking: string | null;
  onPick: (retake: RetakeLane) => void;
}

/**
 * A line's retakes on fixed lanes, under its takes (the mock's "Retakes on lanes" card, #2831): lane, item and length, which lane plays, and
 * "Play this lane", which makes that lane the only one playing on its track. The lane that plays has its button off: it already plays.
 */
export function LaneRetakes({ line, gate, picking, onPick }: LaneRetakesProps) {
  return (
    <section data-lanes={line.lineId} aria-label={`Retakes on lanes of ${line.trackName}`} className="flex flex-col gap-1 pt-1">
      <SectionLabel as="h3" className="block">
        Retakes on lanes
      </SectionLabel>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {line.retakes.map((retake) => {
          const lane = retake.lane + 1;
          const reason = !gate.ok ? gate.reason : retake.plays ? 'This lane already plays.' : picking !== null ? 'REAPER is changing the lanes.' : null;
          return (
            <li
              key={retake.itemGuid}
              data-lane={lane}
              data-plays={retake.plays ? 'true' : undefined}
              className={`flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1 ${retake.plays ? 'bg-[var(--row-selected)]' : ''}`}
            >
              <span className="min-w-0 flex-1 basis-48 break-all">
                <b>Lane {lane}</b>{' '}
                <span className="text-[var(--text-muted)]">
                  {retake.name || 'Untitled item'} · {retake.length.toFixed(1)} s
                </span>
              </span>
              {retake.plays ? <StatusBadge tone="success" label="Plays" shape="tag" /> : null}
              <IconButton
                action="playLane"
                size="sm"
                label={`Play this lane: lane ${lane} on ${line.trackName}`}
                pending={picking === retake.itemGuid}
                {...(reason !== null ? { disabledReason: reason } : {})}
                onClick={() => onPick(retake)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
