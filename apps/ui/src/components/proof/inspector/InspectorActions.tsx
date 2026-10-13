import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { usePort } from '../../../ports/usePort';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { Finding, NarrationApi } from '../../../types';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { formatTime } from '../findingFormat';

/** The one host call the icon row makes itself; the marker goes through the DAW port. */
export type InspectorActionsApi = Pick<NarrationApi, 'findingsGoTo'>;

// Why a control is off when the note itself cannot be placed; the host refuses the same notes in the same words
// (apps/desktop/bindings_navigation.go and bindings_marker.go), so a button is never on for a request that can only be refused. Any note
// can get a marker, whatever its decision (SD-4).
const NO_ITEM = 'This note has no place in the DAW to go to, because it came from an older check. Run the check again to record one.';
const NO_SOURCE_TIME = 'This note has no time in its audio to put a marker at.';
const CHECKING = 'Checking what the DAW can do…';
const NOT_OFFERED = 'Your DAW does not offer this.';

type Gate = { ok: true } | { ok: false; reason: string };

/** The DAW the setup names, for the controls' labels (mock "Show in Audacity"), or "the DAW" while it has not answered or names none. */
export const dawNameOf = (capabilities: DawCapabilities | undefined): string =>
  !capabilities || capabilities.daw === 'none' || capabilities.daw === 'Built-in' ? 'the DAW' : capabilities.daw;

/** The capability's own sentence when the DAW does not offer it. */
function gateOf(capabilities: DawCapabilities | undefined, name: string): Gate {
  if (!capabilities) return { ok: false, reason: CHECKING };
  const support = capabilities.capabilities[name];
  return support?.available ? { ok: true } : { ok: false, reason: support?.message ?? NOT_OFFERED };
}

/**
 * The Studio Next Inspector's icon row: Show in <DAW>, Add marker in <DAW>, Open this chapter in Script, Open this chapter in Booth,
 * and Reopen once a decision is made. The two DAW actions follow `usePort('daw').capabilities()` (`navigate` and `markers`), which also
 * names the DAW, and the note itself; when one is off, the capability's own sentence is shown beside the row. The two links are the
 * caller's: this file imports no router. While the evidence is changed (`inert`) every control in the row is off.
 */
export function InspectorActions({
  finding,
  api,
  inert = false,
  onOpenScript,
  onOpenBooth,
  onReopen,
}: {
  finding: Finding;
  api: InspectorActionsApi;
  /** The evidence changed: nothing in the row acts until the narrator takes the new evidence. */
  inert?: boolean;
  onOpenScript: (chapterId: string) => void;
  onOpenBooth: (chapterId: string) => void;
  /** Puts a decided note back to `unreviewed` through the page's decision handler. */
  onReopen: () => void;
}) {
  const daw = usePort('daw');
  const action = usePendingAction();
  const [capabilities, setCapabilities] = useState<DawCapabilities>();
  const [result, setResult] = useState<{ message: string; failed: boolean }>();

  useEffect(() => {
    let current = true;
    daw.capabilities().then(
      (found) => current && setCapabilities(found),
      (error) => current && setResult({ message: `The DAW was not asked: ${apiErrorMessage(error)}`, failed: true }),
    );
    return () => {
      current = false;
    };
  }, [daw]);

  const placed = Boolean(finding.source.item_guid || finding.time_range);
  const goto = gateOf(capabilities, 'navigate');
  const gotoReason = !goto.ok ? goto.reason : placed ? undefined : NO_ITEM;
  const marker = gateOf(capabilities, 'markers');
  const markerReason = !marker.ok ? marker.reason : finding.time_range?.source_start === undefined ? NO_SOURCE_TIME : undefined;
  const dawName = dawNameOf(capabilities);
  const chapterId = finding.manuscript?.chapter_id;
  const decided = finding.review.status !== 'unreviewed';

  const show = (message: string, failed = false) => setResult({ message, failed });
  const showInDaw = () =>
    action.run('goto', async () => {
      setResult(undefined);
      try {
        const went = await api.findingsGoTo(finding.id);
        if (went.outcome === 'refused') show(went.message, true);
        else if (went.outcome === 'navigated') show(`Moved to ${formatTime(went.projectTime)} in ${dawName}.`);
      } catch (error) {
        show(`The DAW was not asked: ${apiErrorMessage(error)}`, true);
      }
    });
  const addMarker = () =>
    action.run('marker', async () => {
      setResult(undefined);
      try {
        const added = await daw.addMarker(finding.id);
        if (added.refused) show(added.refused, true);
        else show(added.message || (added.changed ? `Marker added in ${dawName}. One Undo there removes it.` : 'This note already has a marker here.'));
      } catch (error) {
        show(`The DAW was not asked: ${apiErrorMessage(error)}`, true);
      }
    });

  const reasons = [...new Set([gotoReason, markerReason].filter((reason): reason is string => Boolean(reason)))];

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Actions" className="flex flex-wrap items-center gap-1">
        <IconButton
          action="showInReaper"
          label={`Show in ${dawName}`}
          disabled={inert}
          disabledReason={gotoReason}
          pending={action.isPending('goto')}
          onClick={() => void showInDaw()}
        />
        <IconButton
          action="addMarker"
          label={`Add marker in ${dawName}`}
          disabled={inert}
          disabledReason={markerReason}
          pending={action.isPending('marker')}
          onClick={() => void addMarker()}
        />
        <IconButton
          action="openInScript"
          label="Open this chapter in Script"
          disabled={inert || !chapterId}
          onClick={() => chapterId && onOpenScript(chapterId)}
        />
        <IconButton
          action="openInBooth"
          label="Open this chapter in Booth"
          disabled={inert || !chapterId}
          onClick={() => chapterId && onOpenBooth(chapterId)}
        />
        <span className="flex-1" />
        {decided && (
          <Button variant="secondary" size="sm" disabled={inert} onClick={onReopen}>
            Reopen
          </Button>
        )}
      </div>
      {reasons.map((reason) => (
        <p key={reason} className="text-sm text-[var(--text-muted)]">
          {reason}
        </p>
      ))}
      {result?.failed ? (
        <p role="alert" className="text-sm text-[var(--danger-text)]">
          {result.message}
        </p>
      ) : (
        <p role="status" className="text-sm empty:hidden">
          {result?.message}
        </p>
      )}
    </div>
  );
}
