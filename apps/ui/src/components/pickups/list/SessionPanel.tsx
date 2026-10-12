import type { PickupItem } from '../../../api/contracts/pickups';
import { describeApiError } from '../../../api/errorMessage';
import type { Measured } from '../../../api/schemas/base';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { NOT_MEASURED, sessionMinutes } from '../../production/measured/measured.selectors';
import { pickupScript, sessionPickups, type ChapterRef } from './pickupRows';

/** What the DAW's capability setup says about one thing the panel does (`useCapability('markers')`): whether it can, and the host's sentence when it cannot. */
export type Gate = { available: boolean; message?: string };

/**
 * The "Pickup session" side panel (mock): how many open, included lines the next Booth session takes, about how long that is (only from a
 * sourced figure, ADR 0015), open them in the Booth, add them as markers in the DAW, or copy the pickup script.
 */
export function SessionPanel({
  pickups,
  chapters,
  seconds,
  dawName,
  markers,
  onOpenInBooth,
  onAddMarkers,
}: {
  /** The pickups in view; the session is the open ones among them that are not left out. */
  pickups: readonly PickupItem[];
  chapters: readonly ChapterRef[];
  /** The recording time those lines take, from the measurements, or the reason there is none. */
  seconds: Measured<number>;
  /** The DAW's name for the marker icon's tip. */
  dawName: string;
  markers: Gate;
  onOpenInBooth: (pickups: PickupItem[]) => void;
  /** Rejects with the host's words when the DAW refuses. */
  onAddMarkers: (pickups: PickupItem[]) => Promise<unknown>;
}) {
  const overlay = useOverlay();
  const picked = sessionPickups(pickups);
  const minutes = sessionMinutes(seconds);
  const count = picked.length;

  const markersReason = !markers.available ? markers.message || `${dawName} cannot add markers now.` : count === 0 ? 'No lines in the session.' : undefined;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pickupScript(picked, chapters));
      overlay.toast('Copied.');
    } catch {
      overlay.toast('Copy failed.');
    }
  };

  return (
    <Panel title="Pickup session" actions={<IconButton action="copy" label="Copy the pickup script" onClick={() => void copy()} />} className="min-w-0">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span>Lines</span>
          <b className="font-['IBM_Plex_Mono',ui-monospace,monospace]">{count}</b>
        </div>
        <div className="flex items-center justify-between">
          <span>About</span>
          <b className="font-['IBM_Plex_Mono',ui-monospace,monospace]">{minutes.ok ? `${minutes.value} min` : NOT_MEASURED}</b>
        </div>
        <Button disabled={count === 0} onClick={() => onOpenInBooth(picked)}>
          Open {count} in Booth
        </Button>
        <div>
          <IconButton
            action="addMarker"
            label={`Add ${count} as markers in ${dawName}`}
            disabledReason={markersReason}
            onClick={() => void onAddMarkers(picked).catch((error: unknown) => overlay.toast(describeApiError(error), { tone: 'error' }))}
          />
        </div>
        {!markers.available && <p className="text-[0.8125rem] text-[var(--text-muted)]">{markersReason}</p>}
      </div>
    </Panel>
  );
}
