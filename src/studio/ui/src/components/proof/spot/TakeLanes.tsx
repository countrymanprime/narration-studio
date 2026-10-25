import type { Spot } from './spot';

/** A lane's height: room for the take's name inside it, as the Studio Next mock draws it (`TakeLanes`, 13 px). */
const LANE_HEIGHT = 14;

/**
 * The other takes at a spot, under the waveform (Studio Next mock `TakeLanes`): each a labelled lane in the window's time scale (`winStart`,
 * `winLen` in seconds). The take that plays is drawn once, as the band on the waveform itself, not again here (alignment audit R3PF-1). A
 * take outside the window is clipped; a hidden take is a dashed outline with no fill (its name keeps full contrast). Nothing is drawn at a spot with one take.
 */
export function TakeLanes({ spot, winStart, winLen }: { spot: Spot | null; winStart: number; winLen: number }) {
  if (!spot || winLen <= 0) return null;
  const place = (start: number, len: number) => {
    const x0 = Math.max(0, ((start - winStart) / winLen) * 100);
    const x1 = Math.min(100, ((start + len - winStart) / winLen) * 100);
    return x1 > x0 ? { left: `${x0}%`, width: `${x1 - x0}%` } : undefined;
  };
  const others = spot.takes.filter((take) => !take.active);
  if (others.length === 0) return null;
  return (
    <div role="group" aria-label={`${spot.takes.length} takes at this spot`} className="relative flex flex-col gap-1 py-1" data-take-lanes>
      {others.map((take) => {
        const at = place(take.start, take.len);
        return (
          <div key={take.id} data-lane={take.id} className="relative" style={{ height: LANE_HEIGHT }}>
            {at && (
              <div
                title={take.label}
                className={`absolute inset-y-0 flex items-center overflow-hidden rounded-[0.1875rem] border border-[var(--line-strong)] font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.625rem] whitespace-nowrap text-[var(--text-muted)] ${take.hidden ? 'border-dashed' : 'bg-[var(--surface-2)]'}`}
                style={at}
              >
                <span className="px-1">{take.label}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
