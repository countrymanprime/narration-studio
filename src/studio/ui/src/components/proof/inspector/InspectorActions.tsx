import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { shownFindingNoteType } from '../../../api/contracts/findings';
import type { Finding } from '../../../types';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { RepairInReaperButton } from '../../engine/RepairInReaperButton';
import { AddMarkersButton } from '../../engine/AddMarkers';
import { dawNameOf, ShowInDawButton } from '../../engine/ShowInDaw';
import type { EquivalenceApi } from './equivalence';
import { HearIt, type HearItApi } from './HearIt';
import { TreatAsSame } from './TreatAsSame';

/** The host calls the icon row makes itself (Hear it's loop and Treat as the same; Show in the DAW is the shared button's); the marker goes through the DAW port. */
export type InspectorActionsApi = HearItApi & EquivalenceApi;

// Why a control is off when the note itself cannot be placed; the host refuses the same notes in the same words
// (src/studio/desktop/bindings_navigation.go and bindings_marker.go), so a button is never on for a request that can only be refused. Any note
// can get a marker, whatever its decision (SD-4).
const NO_ITEM = 'This note has no place in the DAW to go to, because it came from an older check. Run the check again to record one.';
const NO_SOURCE_TIME = 'This note has no time in its audio to put a marker at.';
const NO_TIME = 'This note has no time in its audio to go to.';

// The note types the REAPER repair launchers work on, by the type the narrator sees (a click is `mouth`); noise and the rest are not theirs.
const REPAIRABLE_TYPES: ReadonlySet<string> = new Set(['mouth', 'plosive', 'breath']);

export { dawNameOf };

/**
 * The rebuilt Inspector's icon row: Hear it (the note with 3 s either side, `HearIt`), Show in <DAW>, Add marker in <DAW>, on a one-word
 * misread Treat these two words as the same in later checks (`TreatAsSame`, #2736), Open this chapter in Script, Open this chapter in Booth,
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
  onNoteRead,
}: {
  finding: Finding;
  api: InspectorActionsApi;
  /** The evidence changed: nothing in the row acts until the narrator takes the new evidence. */
  inert?: boolean;
  onOpenScript: (chapterId: string) => void;
  onOpenBooth: (chapterId: string) => void;
  /** Puts a decided note back to `unreviewed` through the page's decision handler. */
  onReopen: () => void;
  /** The note as the host now holds it, read again after a refused Treat as the same. */
  onNoteRead: (finding: Finding) => void;
}) {
  const daw = usePort('daw');
  const [capabilities, setCapabilities] = useState<DawCapabilities>();
  const [capsFailed, setCapsFailed] = useState(false);
  const [result, setResult] = useState<{ message: string; failed: boolean }>();

  useEffect(() => {
    let current = true;
    daw.capabilities().then(
      (found) => current && setCapabilities(found),
      (error) => {
        if (!current) return;
        setCapsFailed(true);
        setResult({ message: `The DAW was not asked: ${apiErrorMessage(error)}`, failed: true });
      },
    );
    return () => {
      current = false;
    };
  }, [daw]);

  // A note with an item but no time would only move to the item's start, which says nothing about the note (#2800).
  const placed = Boolean(finding.source.item_guid || finding.time_range);
  // The note's own reason it cannot be gone to; the DAW's reason (the capability's sentence) is the shared button's.
  const noteReason = !placed ? NO_ITEM : finding.time_range ? undefined : NO_TIME;
  // The note's own reason it cannot get a marker; the DAW's reason (the capability's sentence) is the shared button's.
  const markerReason = finding.time_range?.source_start === undefined ? NO_SOURCE_TIME : undefined;
  const dawName = dawNameOf(capabilities);
  const chapterId = finding.manuscript?.chapter_id;
  const decided = finding.review.status !== 'unreviewed';

  const show = (message: string, failed = false) => setResult({ message, failed });
  const reasons = [...new Set([noteReason, markerReason].filter((reason): reason is string => Boolean(reason)))];

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Actions" className="flex flex-wrap items-center gap-1">
        <HearIt finding={finding} api={api} dawName={dawName} capabilities={capabilities} capabilitiesFailed={capsFailed} inert={inert} onResult={setResult} />
        <ShowInDawButton
          target={{ kind: 'finding', id: finding.id, reason: noteReason }}
          disabled={inert}
          onResult={({ message, failed }) => show(message, failed)}
        />
        <AddMarkersButton
          target={{ kind: 'finding', id: finding.id, at: finding.time_range?.start }}
          disabled={inert}
          reason={markerReason}
          onResult={({ message, failed }) => show(message, failed)}
        />
        {/* #2821: the repair launchers act on the item Show in the DAW has just selected. */}
        {REPAIRABLE_TYPES.has(shownFindingNoteType(finding)) && <RepairInReaperButton />}
        <TreatAsSame finding={finding} api={api} inert={inert} onNoteRead={onNoteRead} />
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
          // The row's icon buttons' height (alignment audit XPF-14).
          <Button variant="secondary" disabled={inert} onClick={onReopen}>
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
