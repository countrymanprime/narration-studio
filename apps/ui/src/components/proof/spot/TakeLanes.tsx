import type { Spot } from './spot';

const LANE_HEIGHT = 6;

/**
 * The takes at a spot under the waveform (Studio Next mock `TakeLanes`): the active take as a labelled band on the trace, every other
 * take a thinner lane below it, all in the window's time scale (`winStart`, `winLen` in seconds). A take outside the window is clipped;
 * a hidden take is dimmed. Nothing is drawn at a spot with one take.
 */
export function TakeLanes({ spot, winStart, winLen }: { spot: Spot | null; winStart: number; winLen: number }) {
  if (!spot || winLen <= 0) return null;
  const place = (start: number, len: number) => {
    const x0 = Math.max(0, ((start - winStart) / winLen) * 100);
    const x1 = Math.min(100, ((start + len - winStart) / winLen) * 100);
    return x1 > x0 ? { left: `${x0}%`, width: `${x1 - x0}%` } : undefined;
  };
  const active = spot.takes.find((take) => take.active);
  const band = active && place(active.start, active.len);
  return (
    <div role="group" aria-label={`${spot.takes.length} takes at this spot`} className="relative flex flex-col gap-1 py-1" data-take-lanes>
      <div className="relative h-5">
        {active && band && (
          <div
            data-active-band={active.id}
            className="absolute inset-y-0 overflow-hidden rounded border border-[var(--ok)] bg-[var(--ok-soft)] text-xs whitespace-nowrap text-[var(--ok-text)]"
            style={band}
          >
            <span className="px-1">{`${active.label} · ${active.kept ? 'Kept' : 'Active'}`}</span>
          </div>
        )}
      </div>
      {spot.takes
        .filter((take) => !take.active)
        .map((take) => {
          const at = place(take.start, take.len);
          return (
            <div key={take.id} data-lane={take.id} className="relative" style={{ height: LANE_HEIGHT }}>
              {at && (
                <div title={take.label} className={`absolute inset-y-0 rounded-full bg-[var(--line-strong)] ${take.hidden ? 'opacity-40' : ''}`} style={at} />
              )}
            </div>
          );
        })}
    </div>
  );
}
