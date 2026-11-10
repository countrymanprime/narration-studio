import { useEffect, useRef, useState } from 'react';
import type { PickupItem } from '../../api/contracts/pickups';
import { apiErrorMessage } from '../../api/errorMessage';
import { useDawCapabilities } from '../../hooks/useDawCapabilities';
import { useOverlay } from '../../overlay/OverlayProvider';
import type { DawClient } from '../../ports';
import { usePort } from '../../ports/usePort';
import { clock } from '../../clock';
import { lineText, reasonSentence } from '../pickups/list/pickupRows';
import { useDawFileLinked } from '../connection/dawFileLinked';
import { IconButton } from '../primitives/IconButton';
import { dawNameOf } from './ShowInDaw';
import { pluralWord } from '../../plural';

/**
 * What an Add marker press is about (#2830): one Proof note, or the pickups of a session. A finding goes through `daw.addMarker`, pickups through
 * `daw.addPickupMarkers`; the label, the gate, the busy state and every sentence are this file's, so Proof, Editing and Pickups say the same
 * things. `at` is the finding's time in seconds, for "A marker is already at 3:41."
 */
export type AddMarkersTarget = { kind: 'finding'; id: string; at?: number } | { kind: 'pickups'; pickups: readonly PickupItem[] };

/** What the press said: `failed` is an error, shown as the caller's inline message or an error toast. */
export type AddMarkersResult = { message: string; failed: boolean; added: boolean };

/** The DAW's answer to "can it add markers now", or the caller's own reason (the project file is not linked). */
export type MarkersGate = { available: boolean; message?: string };

/** REAPER takes markers only into a linked project file, and the top bar's badge asks for the link first, so the button says the same. */
const NOT_LINKED = 'Link a REAPER project (.rpp) file to add markers.';
/** How long a press waits for the DAW before it says so and frees the button. */
const ASK_DEADLINE_MS = 15000;
const NONE_PLACED = 'None of these lines has a place in the recording yet.';

/** The label every Add marker control carries, a button's and a menu entry's alike. `count` is the pickups that have a place; undefined while it is not known. */
export function addMarkersLabel(dawName: string, target: AddMarkersTarget, count?: number): string {
  if (target.kind === 'finding') return `Add marker in ${dawName}`;
  return count === undefined ? `Add as markers in ${dawName}` : `Add ${count} as markers in ${dawName}`;
}

/**
 * The one answer to "can markers be added now", for every page and menu (#2830, #1939): the DAW's `markers` capability, and for REAPER a linked project file. A read of
 * what the DAW can do that has not come back, or failed, is said, not guessed.
 */
export function useMarkersGate(): MarkersGate {
  const { caps, failed } = useDawCapabilities();
  const linked = useDawFileLinked();
  if (failed) return { available: false, message: 'Could not ask the DAW what it can do.' };
  if (!caps) return { available: false, message: 'Checking what the DAW can do.' };
  if (caps.daw === 'REAPER' && linked === false) return { available: false, message: NOT_LINKED };
  return caps.capabilities.markers ?? { available: false };
}

/** How many of the pickups the host can place in the recording: the others get no marker. */
const placeableCount = (pickups: readonly PickupItem[]): number => pickups.filter((pickup) => pickup.at !== null).length;

/**
 * The one place an Add marker press reaches the host, and the sentence for what came back. A line the host cannot place gets no marker, so the count on
 * the button and the sentence agree.
 */
export async function addMarkers(daw: Pick<DawClient, 'addMarker' | 'addPickupMarkers'>, target: AddMarkersTarget, dawName: string): Promise<AddMarkersResult> {
  if (target.kind === 'finding') {
    try {
      const added = await daw.addMarker(target.id);
      if (added.refused) return { message: added.refused, failed: true, added: false };
      const already = target.at === undefined ? 'This note already has a marker here.' : `A marker is already at ${clock(target.at)}.`;
      return {
        message: added.message || (added.changed ? `Marker added in ${dawName}. One Undo there removes it.` : already),
        failed: false,
        added: added.changed,
      };
    } catch (error) {
      return { message: `The DAW was not asked: ${apiErrorMessage(error)}`, failed: true, added: false };
    }
  }
  const placed = target.pickups.filter((p): p is PickupItem & { at: number } => p.at !== null);
  if (placed.length === 0) return { message: 'None of these lines has a place in the recording yet, so no marker was added.', failed: true, added: false };
  const skipped = target.pickups.length - placed.length;
  try {
    const result = await daw.addPickupMarkers(placed.map((p) => ({ ref: p.id, start: p.at, tag: p.type, note: lineText(p) })));
    if (!result.ok) return { message: result.message, failed: true, added: false };
    const lines = skipped > 0 ? `${placed.length} of ${target.pickups.length} lines` : placed.length === 1 ? '1 line' : `${placed.length} lines`;
    const left =
      skipped > 0
        ? ` ${skipped} ${skipped === 1 ? 'line has' : 'lines have'} no place in the recording yet and ${skipped === 1 ? 'was' : 'were'} left out.`
        : '';
    return {
      message: result.changed
        ? `Pickup ${pluralWord(placed.length, 'marker')} for ${lines} ${placed.length === 1 ? 'is' : 'are'} in ${dawName}.${left}`
        : `Those markers were already in ${dawName}.${left}`,
      failed: false,
      added: result.changed,
    };
  } catch (error) {
    return { message: reasonSentence(error), failed: true, added: false };
  }
}

/**
 * The Add marker icon button every page mounts: Proof's inspector (a note), Editing's flag card (the note on the flagged words) and the Pickups session
 * panel (its lines). `gate` is the caller's own answer to "can markers be added" (Pickups: the project file is not linked), in place of the DAW's
 * `markers` capability; `reason` and `disabled` switch it off for the caller's own cause (a note with no time, stale evidence). `onResult` takes the sentence in
 * place of a toast; `onDone` runs after a press that added markers (the Pickups list is read again).
 */
export function AddMarkersButton({
  target,
  size,
  gate,
  reason,
  disabled,
  dawName,
  countKnown = true,
  describedBy,
  onResult,
  onDone,
}: {
  target: AddMarkersTarget;
  size?: 'sm';
  gate?: MarkersGate;
  reason?: string;
  disabled?: boolean;
  /** The DAW's name when the page names it its own way ("the built-in recorder"). */
  dawName?: string;
  /** Pickups: false while the list is still being read, so the label names no number. */
  countKnown?: boolean;
  /** The id of text on the page that says why this is off, read with the button. */
  describedBy?: string;
  onResult?: (result: AddMarkersResult) => void;
  onDone?: () => void;
}) {
  const daw = usePort('daw');
  const overlay = useOverlay();
  const { caps } = useDawCapabilities();
  const name = dawName ?? dawNameOf(caps);
  const markers: MarkersGate = useMarkersGate();
  const effective = gate ?? markers;
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const count = target.kind === 'pickups' ? (countKnown ? placeableCount(target.pickups) : undefined) : undefined;
  const why = !effective.available
    ? effective.message || `${name} cannot add markers now.`
    : (reason ?? (target.kind === 'pickups' && target.pickups.length > 0 && placeableCount(target.pickups) === 0 ? NONE_PLACED : undefined));

  // The press belongs to the target it was made for: an answer that arrives after the target changed or the button left is not said, and a new target starts
  // free (the Proof inspector keeps one button over every note, the flag card one over every flag).
  const key = target.kind === 'finding' ? `f:${target.id}` : `p:${target.pickups.map((p) => p.id).join(',')}`;
  const live = useRef(key);
  live.current = key;
  useEffect(() => {
    live.current = key;
    busy.current = false;
    setPending(false);
    return () => {
      live.current = '';
    };
  }, [key]);

  const press = (): void => {
    // A second press while the markers are being written would add them twice.
    if (busy.current || why) return;
    const mine = key;
    busy.current = true;
    setPending(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<AddMarkersResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ message: `${name} did not answer. Press Add marker again to try once more.`, failed: true, added: false }),
        ASK_DEADLINE_MS,
      );
    });
    void Promise.race([addMarkers(daw, target, name), deadline])
      .then((result) => {
        if (live.current !== mine) return;
        if (onResult) onResult(result);
        else if (result.failed) overlay.toast(result.message, { tone: 'error' });
        else overlay.toast(result.message);
        if (!result.failed) onDone?.();
      })
      .finally(() => {
        clearTimeout(timer);
        if (live.current === mine) {
          busy.current = false;
          setPending(false);
        }
      });
  };

  return (
    <IconButton
      action="addMarker"
      label={addMarkersLabel(name, target, count)}
      size={size}
      disabled={disabled}
      disabledReason={why}
      aria-describedby={describedBy}
      pending={pending}
      onClick={press}
    />
  );
}
