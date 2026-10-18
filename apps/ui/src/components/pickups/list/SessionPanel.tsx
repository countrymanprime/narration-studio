import { useId, useRef, useState } from 'react';
import type { PickupItem } from '../../../api/contracts/pickups';
import type { Measured } from '../../../api/schemas/base';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { Skeleton } from '../../primitives/Skeleton';
import { NOT_MEASURED, sessionMinutes } from '../../production/measured/measured.selectors';
import { pickupScript, reasonSentence, sessionPickups, type ChapterRef } from './pickupRows';

/** What the DAW's capability setup says about one thing the panel does (`useCapability('markers')`): whether it can, and the host's sentence when it cannot. */
export type Gate = { available: boolean; message?: string };

/**
 * The "Pickup session" side panel (mock): how many open, included lines the next Booth session takes, about how long that is (only from a
 * sourced figure), open them in the Booth, add them as markers in the DAW, or copy the pickup script.
 */
export function SessionPanel({
  pickups,
  chapters,
  seconds,
  unreadable = false,
  loading = false,
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
  /** The list could not be read: the session is unknown, not empty. */
  unreadable?: boolean;
  /** The list is still being read for the first time: the session is unknown, not empty, so the figures are blocks. The table's own region announces the read. */
  loading?: boolean;
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
  /* Why the session is empty, said for what is true: nothing listed, nothing readable, all recorded, or all left out. */
  const showEmptyReason = count === 0 && !loading;
  const emptyReason = unreadable
    ? 'The list could not be read, so the session is not known yet.'
    : pickups.length === 0
      ? 'There are no pickups to include yet.'
      : pickups.every((pickup) => pickup.done)
        ? 'Every line in view is recorded.'
        : 'No lines in the session: tick a line to include it.';
  /* A button that is off stays focusable and names its reason, so the keyboard reaches the why as well as the sighted. */
  const emptyId = useId();
  const markersId = useId();

  const copy = async () => {
    if (picked.length === 0) {
      overlay.toast(unreadable ? 'The list could not be read, so there is nothing to copy yet.' : 'No lines in the session to copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(pickupScript(picked, chapters));
      overlay.toast('Copied.');
    } catch {
      overlay.toast('The script could not be copied: this window may not allow the clipboard. Try again after clicking in the page.', { tone: 'error' });
    }
  };

  /* A second press while the markers are being written would add them twice. */
  const [adding, setAdding] = useState(false);
  const addingNow = useRef(false);
  const addMarkers = () => {
    if (addingNow.current) return;
    addingNow.current = true;
    setAdding(true);
    onAddMarkers(picked)
      .catch((error: unknown) => overlay.toast(reasonSentence(error), { tone: 'error' }))
      .finally(() => {
        addingNow.current = false;
        setAdding(false);
      });
  };

  return (
    <Panel title="Pickup session" actions={<IconButton action="copy" label="Copy the pickup script" onClick={() => void copy()} />} className="min-w-0">
      <div className="flex flex-col gap-3" aria-busy={loading || undefined}>
        <div className="flex items-center justify-between">
          <span>Lines</span>
          <b className="font-['IBM_Plex_Mono',ui-monospace,monospace]">{loading ? <Skeleton className="w-10" /> : unreadable ? 'not known' : count}</b>
        </div>
        <div className="flex items-center justify-between">
          <span>About</span>
          <b className="font-['IBM_Plex_Mono',ui-monospace,monospace]">
            {loading ? <Skeleton className="w-14" /> : minutes.ok ? `${minutes.value} min` : NOT_MEASURED}
          </b>
        </div>
        <Button
          aria-disabled={count === 0 || undefined}
          aria-describedby={showEmptyReason ? emptyId : undefined}
          onClick={() => count > 0 && onOpenInBooth(picked)}
        >
          Open {count} in Booth
        </Button>
        <div>
          <IconButton
            action="addMarker"
            label={`Add ${count} as markers in ${dawName}`}
            disabledReason={markersReason}
            aria-describedby={!markers.available ? markersId : showEmptyReason ? emptyId : undefined}
            pending={adding}
            onClick={addMarkers}
          />
        </div>
        {showEmptyReason && (
          <p id={emptyId} className="text-[0.8125rem] text-[var(--text-muted)]">
            {emptyReason}
          </p>
        )}
        {!markers.available && (
          <p id={markersId} className="text-[0.8125rem] text-[var(--text-muted)]">
            {markersReason}
          </p>
        )}
      </div>
    </Panel>
  );
}
