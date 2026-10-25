import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';
import { SectionLabel } from '../primitives/SectionLabel';
import { StatusBadge } from '../primitives/StatusBadge';
import { ToolResult } from './ToolResult';
import type { RetakeLane, RetakeLaneLine, RetakeLanesList, RetakeLanesState } from '../../types';
import { brand } from '../../brand.gen';

const IDLE: RetakeLanesState = { phase: 'idle', message: '', lineId: '', itemGuid: '', trackName: '' };

function formatPosition(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, '0')}`;
}

/** The track of the retake a successful pick named, so every line on that track shows the new play state. */
function pickedTrack(list: RetakeLanesList | null, state: RetakeLanesState): string | undefined {
  if (state.phase !== 'picked' || state.lane === undefined || !list) return undefined;
  return list.lines.find((line) => line.retakes.some((retake) => retake.itemGuid === state.itemGuid))?.trackGuid;
}

function RetakeRow({
  line,
  retake,
  plays,
  state,
  onPick,
}: {
  line: RetakeLaneLine;
  retake: RetakeLane;
  plays: boolean;
  state: RetakeLanesState;
  onPick: () => void;
}) {
  const picking = state.phase === 'picking';
  const lane = retake.lane + 1;
  return (
    // The playing lane is the highlighted row, its status a badge in a fixed slot, and its button off: it already plays (ENX-27).
    <li
      className="flex flex-wrap items-center justify-between gap-3 border-t p-2 first:border-t-0"
      style={{ borderColor: 'var(--border)', background: plays ? 'var(--row-selected)' : undefined }}
    >
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium">Lane {lane}</p>
        <p className="text-sm break-all" style={{ color: 'var(--text-muted)' }}>
          {retake.name || 'Untitled item'} · {retake.length.toFixed(1)} s
        </p>
      </div>
      <span className="w-[4.5rem] flex-none">
        <StatusBadge tone={plays ? 'success' : 'neutral'} label={plays ? 'Plays' : 'Silent'} />
      </span>
      <Button
        variant="secondary"
        aria-label={`Play this lane: lane ${lane} for ${line.lineId} on ${line.trackName}`}
        onClick={onPick}
        pending={picking && state.itemGuid === retake.itemGuid}
        disabled={plays || (picking && state.itemGuid !== retake.itemGuid)}
      >
        Play this lane
      </Button>
    </li>
  );
}

function EmptyList({ list }: { list: RetakeLanesList }) {
  return (
    <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
      {list.laneTracks === 0
        ? 'No track in the saved project uses fixed item lanes. Record retakes into lanes in REAPER first: The app never turns lanes on or converts takes to lanes.'
        : 'No line has retakes on more than one lane of a track, so there is nothing to choose. Only items linked to manuscript lines are listed.'}
    </p>
  );
}

/** Retakes as fixed lanes: lists each manuscript line's
 * retakes on fixed lanes, read from the saved project, and makes the narrator's pick the only lane playing on its
 * track in REAPER. That is the only change it makes, one undo step. Reachable from the audio engine panel next to the other
 * REAPER actions, not a new nav item. */
export function RetakeLanesDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const [list, setList] = useState<RetakeLanesList | null>(null);
  const [listError, setListError] = useState('');
  const [state, setState] = useState<RetakeLanesState>(IDLE);
  const [requestError, setRequestError] = useState('');
  const [requested, setRequested] = useState('');

  useEffect(() => {
    const unsubscribe = api.subscribeRetakeLanes(setState);
    void api
      .retakeLanesState()
      .then(setState)
      .catch(() => {});
    api
      .retakeLanesList()
      .then(setList)
      .catch((reason: unknown) => setListError(String(reason)));
    return unsubscribe;
  }, [api]);

  const picking = state.phase === 'picking';
  const track = pickedTrack(list, state);
  // The pick's outcome shows under the line it was made for, where the narrator's eyes already are; one that names no
  // listed retake (the list was reloaded since) shows under the list instead.
  const feedbackGuid = requestError ? requested : state.itemGuid;
  const feedbackListed = !!list?.lines.some((line) => line.retakes.some((retake) => retake.itemGuid === feedbackGuid));

  const pick = (line: RetakeLaneLine, retake: RetakeLane) => {
    setRequestError('');
    setRequested(retake.itemGuid);
    api.retakeLanesPick(line.lineId, retake.itemGuid).catch((reason: unknown) => setRequestError(String(reason)));
  };

  // A pick's outcome is one result block (R3EN2-13): a success, or the failure of the request or of REAPER.
  const failure = requestError || (state.phase === 'error' ? state.message : '');
  const feedback = failure ? (
    <div className="mt-2">
      <ToolResult tone="danger" message={failure} />
    </div>
  ) : state.phase === 'picked' ? (
    <div className="mt-2">
      <ToolResult tone="success" message={state.message} />
    </div>
  ) : null;

  return (
    <Dialog
      dismissOnOutsidePress={true}
      title="Retakes on lanes"
      onClose={picking ? undefined : onClose}
      escapeCloses={!picking}
      description={`Choose which lane plays for a line. A lane plays across its whole track, so choosing one silences the other lanes of that track everywhere, not only for this line. ${brand.name} changes nothing else, and Undo in REAPER puts the previous lanes back.`}
      actions={
        <Button variant="secondary" onClick={onClose} disabled={picking}>
          Close
        </Button>
      }
    >
      {listError && <ToolResult tone="danger" message={listError} />}
      {list && list.lines.length === 0 && <EmptyList list={list} />}
      {list && list.lines.length > 0 && (
        <div className="mt-3 space-y-4">
          {list.lines.map((line) => (
            <section key={`${line.trackGuid}/${line.lineId}`} aria-label={`${line.lineId} on ${line.trackName}`}>
              {/* The group's heading is a section label, so it reads apart from the lanes under it (R3EN2-6). */}
              <SectionLabel as="h3" className="mb-1 block break-all">
                {line.trackName} · {line.lineId} · {formatPosition(line.retakes[0]?.position ?? 0)}
              </SectionLabel>
              <ul>
                {line.retakes.map((retake) => (
                  <RetakeRow
                    key={retake.itemGuid}
                    line={line}
                    retake={retake}
                    plays={track === line.trackGuid ? retake.lane === state.lane : retake.plays}
                    state={state}
                    onPick={() => pick(line, retake)}
                  />
                ))}
              </ul>
              {feedbackListed && line.retakes.some((retake) => retake.itemGuid === feedbackGuid) && feedback}
            </section>
          ))}
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            What plays is read from the project as last saved in REAPER.
          </p>
        </div>
      )}
      {!feedbackListed && feedback}
    </Dialog>
  );
}
