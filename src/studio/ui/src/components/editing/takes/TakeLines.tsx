import type { KeyboardEventHandler } from 'react';
import { IconButton } from '../../primitives/IconButton';
import { statusLabel, statusTone, type StatusId } from '../../../kinds/statusTone';
import { StatusBadge } from '../../primitives/StatusBadge';
import { clockText } from '../../booth/boothProgress';
import { Diff } from './TakeDiff';
import { Suggested } from './Suggested';
import { TakeCompare } from './TakeCompare';
import { TakeEvidence } from './TakeEvidence';
import { matchedShare, takeDiff } from './diff';
import { placedLabel, suggestionFor } from './evidence';
import { useTakeControls } from './takeControls';
import type { LinePassage, LineTake, TakesGate } from './types';

export interface TakeLinesProps {
  passage: LinePassage;
  /** The take the keys are on (`aria-activedescendant`), or null. */
  onTake: string | null;
  /** The take the DAW said it kept, or null. */
  keptId: string | null;
  /** The take playing now, or null. */
  playingId: string | null;
  gate: TakesGate;
  onKeep: (take: LineTake) => void;
  /** Plays the take's own source range; called again for the take that plays, it stops. */
  onPlay: (take: LineTake) => void;
  /** Escape inside the takes: the page folds them and focuses their chip. */
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  /** The takes the narrator hid, shown here only while they are looked at: they read Hidden, not Muted. */
  hiddenIds?: readonly string[];
  /** The take the stack sits on, when the line is stacked: it reads First read. */
  firstReadId?: string | null;
  /** What the DAW calls a take (`takeSourceLabel`), named in each take's sub-line. */
  sourceLabel?: string | null;
  /** Seconds into the chapter where the second read of a doubled take starts, or null when the take reads the line once. */
  duplicateAt?: number | null;
}

const takeRowId = (passageId: string, takeId: string): string => `take-${passageId}-${takeId}`;
const takesGroupId = (passageId: string): string => `takes-${passageId}`;

/** How the take stands: kept (the DAW said so), the one playing in the DAW, or muted. */
function stateOf(take: LineTake, keptId: string | null, hidden: boolean): StatusId {
  if (keptId === take.id) return 'kept_take';
  if (take.active) return 'active_take';
  return hidden ? 'hidden_take' : 'muted';
}

function TakeRow({ passage, take, suggestedId, ...rest }: TakeLinesProps & { take: LineTake; suggestedId: string | null }) {
  const { onTake, keptId, playingId, gate, onKeep, onPlay, hiddenIds = [], firstReadId = null, sourceLabel = null } = rest;
  const state = stateOf(take, keptId, hiddenIds.includes(take.id));
  const parts = take.said === undefined ? null : takeDiff(passage.script, take.said);
  const share = take.evidence?.matched.ok ? Math.round(take.evidence.matched.value) : parts ? matchedShare(parts) : null;
  const playing = playingId === take.id;
  const kept = keptId === take.id;
  return (
    <div
      id={takeRowId(passage.id, take.id)}
      data-take={take.id}
      data-on-key={onTake === take.id ? 'true' : undefined}
      className={`-ml-[11px] flex flex-col gap-1 border-l-[3px] py-1.5 pr-2.5 pl-2 ${onTake === take.id ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-transparent'}`}
    >
      {/* One grid for every take: the name and its tags, the length bar, the share and the buttons each start and end at the same x on every
          row (alignment audit XED-9, R3ED-12). */}
      <div
        data-take-grid
        className="grid grid-cols-[minmax(0,13rem)_minmax(2rem,1fr)_2.75rem_4.25rem] items-center gap-2 max-[30rem]:grid-cols-[minmax(0,1fr)_2.75rem_4.25rem]"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-['IBM_Plex_Mono',ui-monospace,monospace] font-medium">{take.label}</span>
          <StatusBadge tone={statusTone(state)} label={statusLabel(state)} shape="tag" />
          {firstReadId === take.id ? <StatusBadge tone={statusTone('first_read')} label={statusLabel('first_read')} shape="tag" /> : null}
          {suggestedId === take.id ? <StatusBadge tone={statusTone('suggested_take')} label={statusLabel('suggested_take')} shape="tag" /> : null}
        </span>
        {/* The take's length as a bar, not a waveform: the page draws one waveform, docked above the bar (#2251, item 29). */}
        <span
          data-take-length
          aria-hidden="true"
          className="block h-1.5 rounded-full bg-[var(--line-strong)] max-[30rem]:hidden"
          style={{ maxWidth: `${Math.max(3, Math.round(take.sourceLength * 16))}px` }}
        />
        <span
          className="text-right font-['IBM_Plex_Mono',ui-monospace,monospace] text-[var(--text-muted)]"
          title="Share of the script's words this take read as written"
        >
          {share === null ? '' : `${share}%`}
        </span>
        <span className="flex justify-end gap-1">
          <IconButton
            action={playing ? 'stop' : 'play'}
            size="sm"
            label={`${playing ? 'Stop' : 'Play'} ${take.label}`}
            data-tplay={take.id}
            onClick={() => onPlay(take)}
          />
          {kept ? null : (
            <IconButton
              action="keepTake"
              size="sm"
              label={`Keep ${take.label}`}
              data-tkeep={take.id}
              {...(!gate.ok ? { disabledReason: gate.reason } : !take.usable ? { disabledReason: take.reason ?? 'This take cannot be chosen.' } : {})}
              onClick={() => onKeep(take)}
            />
          )}
        </span>
      </div>
      <div className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-[12px] text-[var(--text-muted)]">
        {[
          take.start === undefined ? null : clockText(take.start),
          `${take.sourceLength.toFixed(0)} s`,
          sourceLabel,
          take.evidence ? placedLabel(take.evidence.via) : null,
        ]
          .filter((part) => part !== null)
          .join(' · ')}
        {!take.usable && take.reason ? ` · ${take.reason}` : ''}
      </div>
      {take.evidence ? <TakeEvidence evidence={take.evidence} /> : null}
      {parts ? <Diff parts={parts} /> : null}
    </div>
  );
}

/**
 * The takes of one line, one sub-line each, under the line: a level drawing, how much of the script the take read as written, what was measured,
 * and what it said against the script. Choose and play from here; nothing is deleted and no control here deletes. The suggestion is shown with
 * its evidence and is never preselected or applied. Controls other slices register come in the footer.
 */
export function TakeLines(props: TakeLinesProps) {
  const { passage, keptId } = props;
  const controls = useTakeControls();
  const suggestion = suggestionFor(passage.takes);
  const labelOf = (id: string): string => passage.takes.find((t) => t.id === id)?.label ?? id;
  const rows = controls.map((c) => ({ id: c.id, node: c.render({ passage, keptId }) })).filter((c) => c.node !== null && c.node !== false);
  return (
    <div
      id={takesGroupId(passage.id)}
      role="group"
      aria-label={`Takes of this line, ${passage.takes.length}`}
      aria-activedescendant={props.onTake ? takeRowId(passage.id, props.onTake) : undefined}
      data-takes={passage.id}
      onKeyDown={props.onKeyDown}
      className="flex w-full max-w-[1000px] flex-col gap-2 pb-2"
    >
      {props.duplicateAt != null ? (
        <p data-dupnote className="m-0 text-[var(--text-muted)]">
          This take reads the line twice. The second read starts at {clockText(props.duplicateAt)}.
        </p>
      ) : null}
      <Suggested suggestion={suggestion} labelOf={labelOf} />
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {passage.takes.map((t) => (
          <TakeRow key={t.id} {...props} take={t} suggestedId={suggestion.take} />
        ))}
      </div>
      <TakeCompare passage={passage} keptId={keptId} playingId={props.playingId} onPlay={props.onPlay} />
      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" data-takes-footer>
          {rows.map((r) => (
            <span key={r.id} className="contents">
              {r.node}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
