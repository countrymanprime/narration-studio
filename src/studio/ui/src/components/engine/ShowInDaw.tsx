import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import type { NarrationApi } from '../../types';
import type { DawCapabilities } from '../../api/contracts/daw';
import { apiErrorMessage } from '../../api/errorMessage';
import { useDawCapabilities } from '../../hooks/useDawCapabilities';
import { overlay } from '../../overlay/overlayService';
import { clock } from '../editing/bar/clock';
import { noteTime } from '../proof/findingFormat';
import { IconButton } from '../primitives/IconButton';

/**
 * Where "Show in {DAW}" goes (#2826). One button on every page, over the one host call each kind of place has:
 * a `passage` (a take's first word) is `workspaceGoTo`; a `finding` (a Proof note) and a `pickup` (the note it came from) are `findingsGoTo`; a
 * `chapter` is `trackSelectInReaper`, which selects the chapter's linked track. `reason` on a finding is why this note cannot be gone to
 * (the host refuses the same notes in the same words).
 */
export type ShowInDawTarget =
  | { kind: 'passage'; chapterId: string; token: number | undefined }
  | { kind: 'finding'; id: string; reason?: string }
  | { kind: 'pickup'; findingId: string | undefined }
  | { kind: 'chapter'; trackGuid: string | undefined };

const CHECKING = 'Checking what the DAW can do.';
const ASK_FAILED = 'Could not ask the DAW what it can do.';
const NO_WORDS = 'These words are not in the script, so the DAW cannot be asked about them.';
const NO_RECORDING = 'This line has no recording to show.';
/** How long a press waits for the DAW before it says so and frees the button. */
const ASK_DEADLINE_MS = 15000;
const NO_TRACK = 'No chapter track is linked to this chapter yet: link one from the audio engine panel';

/** The DAW the setup names, for a control's label, or "the DAW" while it has not answered or names none. */
export const dawNameOf = (capabilities: DawCapabilities | null | undefined): string =>
  !capabilities || capabilities.daw === 'none' || capabilities.daw === 'Built-in' ? 'the DAW' : capabilities.daw;

/** The capability's own sentence when the DAW does not offer it, or null when it does. */
function capabilityReason(caps: DawCapabilities | null, failed: boolean, key: 'navigate' | 'track_select'): string | null {
  if (failed) return ASK_FAILED;
  if (!caps) return CHECKING;
  const support = caps.capabilities[key];
  if (support?.available) return null;
  return support?.message ?? (key === 'navigate' ? 'This DAW cannot move to a place in the project.' : 'This DAW cannot select a track.');
}

function targetReason(target: ShowInDawTarget): string | null {
  switch (target.kind) {
    case 'passage':
      return target.token === undefined || !target.chapterId ? NO_WORDS : null;
    case 'finding':
      return target.reason ?? (target.id ? null : NO_RECORDING);
    case 'pickup':
      return target.findingId ? null : NO_RECORDING;
    case 'chapter':
      return target.trackGuid ? null : NO_TRACK;
  }
}

/** What the press said: `failed` is an error, shown as the caller's inline message or an error toast. */
export type ShowInDawResult = { message: string; failed: boolean };

/** The label every Show in {DAW} control carries, a button's and a menu entry's alike. */
export const showInDawLabel = (dawName: string): string => `Show in ${dawName}`;

/**
 * The one place a Show in {DAW} press reaches the host (#2826): the call the target's kind has, and the sentence that says where the DAW went or why
 * it did not. Null when the host answered with nothing to say. A menu entry that cannot render the button calls this directly; nothing else
 * calls `workspaceGoTo`, `findingsGoTo` or `trackSelectInReaper` for a "show me" (`showInDawGuard.test.ts`).
 */
export async function showInDaw(api: NarrationApi, target: ShowInDawTarget, dawName: string): Promise<ShowInDawResult | null> {
  try {
    if (target.kind === 'chapter') {
      const result = await api.trackSelectInReaper(target.trackGuid!);
      return result.outcome === 'selected'
        ? { message: `Selected in ${dawName}.`, failed: false }
        : { message: result.message || `${dawName} could not select that track.`, failed: true };
    }
    const went =
      target.kind === 'passage'
        ? await api.workspaceGoTo(target.chapterId, target.token!)
        : await api.findingsGoTo(target.kind === 'finding' ? target.id : target.findingId!);
    if (went.outcome === 'refused') return { message: went.message, failed: true };
    const when = target.kind === 'finding' ? noteTime : clock;
    if (went.outcome !== 'navigated') return null;
    // A host that sends no usable time still moved the DAW: say so without printing NaN.
    return { message: Number.isFinite(went.projectTime) ? `Moved to ${when(went.projectTime)} in ${dawName}.` : `Moved in ${dawName}.`, failed: false };
  } catch (error) {
    return { message: `The DAW was not asked: ${apiErrorMessage(error)}`, failed: true };
  }
}

/**
 * The one source of "Show in {DAW}": the label, why it is off, and the call. `onResult` takes the sentence in place of a toast (Proof's inspector
 * shows it in its own status line).
 */
function useShowInDaw(
  target: ShowInDawTarget,
  onResult?: (result: ShowInDawResult) => void,
): { label: string; reason: string | null; pending: boolean; hidden: boolean; go: () => void } {
  const api = useApi();
  const { caps, failed } = useDawCapabilities();
  const [pending, setPending] = useState(false);
  const name = dawNameOf(caps);
  const reason = capabilityReason(caps, failed, target.kind === 'chapter' ? 'track_select' : 'navigate') ?? targetReason(target);
  const say = useCallback(
    (result: ShowInDawResult) => {
      if (onResult) onResult(result);
      else if (result.failed) overlay.toast(result.message, { tone: 'error' });
      else overlay.toast(result.message);
    },
    [onResult],
  );
  // The press belongs to the place it was made for: an answer that arrives after the target changed, or the button left, is not said, and a new
  // place starts free (the Proof inspector keeps one button over every note).
  const key =
    target.kind === 'finding'
      ? `f:${target.id}`
      : target.kind === 'pickup'
        ? `p:${target.findingId}`
        : target.kind === 'passage'
          ? `w:${target.chapterId}:${target.token}`
          : `c:${target.trackGuid}`;
  const live = useRef(key);
  live.current = key;
  useEffect(() => {
    live.current = key;
    setPending(false);
    return () => {
      live.current = '';
    };
  }, [key]);
  const go = (): void => {
    if (reason !== null || pending) return;
    const mine = key;
    setPending(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<ShowInDawResult>((resolve) => {
      timer = setTimeout(() => resolve({ message: `${name} did not answer. Press Show in again to try once more.`, failed: true }), ASK_DEADLINE_MS);
    });
    void Promise.race([showInDaw(api, target, name), deadline])
      .then((result) => {
        if (result && live.current === mine) say(result);
      })
      .finally(() => {
        clearTimeout(timer);
        if (live.current === mine) setPending(false);
      });
  };
  // The built-in recorder is not a DAW: there is no place in a project to show, so no button (the approved mock's last state).
  const hidden = caps !== null && (caps.daw === 'Built-in' || caps.daw === 'none');
  return { label: showInDawLabel(name), reason, pending, hidden, go };
}

/** The Show in {DAW} icon button every page mounts. `disabled` switches it off for a reason of the caller's own (stale evidence). */
export function ShowInDawButton({
  target,
  size,
  disabled,
  onResult,
}: {
  target: ShowInDawTarget;
  size?: 'sm';
  disabled?: boolean;
  onResult?: (result: ShowInDawResult) => void;
}) {
  const show = useShowInDaw(target, onResult);
  if (show.hidden) return null;
  return (
    <IconButton
      action="showInReaper"
      label={show.label}
      size={size}
      disabled={disabled}
      disabledReason={show.reason ?? undefined}
      pending={show.pending}
      onClick={show.go}
    />
  );
}
