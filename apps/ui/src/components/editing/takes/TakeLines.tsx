import { IconButton } from '../../primitives/IconButton';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Diff } from './TakeDiff';
import { MiniWave } from './MiniWave';
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
}

const takeRowId = (passageId: string, takeId: string): string => `take-${passageId}-${takeId}`;
const takesGroupId = (passageId: string): string => `takes-${passageId}`;

/** How the take stands: kept (the DAW said so), the one playing in the DAW, or muted. */
function stateOf(take: LineTake, keptId: string | null): { label: string; tone: 'success' | 'info' | 'neutral' } {
  if (keptId === take.id) return { label: 'Kept', tone: 'success' };
  return take.active ? { label: 'Active', tone: 'info' } : { label: 'Muted', tone: 'neutral' };
}

function TakeRow({ passage, take, suggestedId, ...rest }: TakeLinesProps & { take: LineTake; suggestedId: string | null }) {
  const { onTake, keptId, playingId, gate, onKeep, onPlay } = rest;
  const state = stateOf(take, keptId);
  const parts = take.said === undefined ? null : takeDiff(passage.script, take.said);
  const share = take.evidence?.matched.ok ? Math.round(take.evidence.matched.value) : parts ? matchedShare(parts) : null;
  const playing = playingId === take.id;
  const kept = keptId === take.id;
  return (
    <div
      id={takeRowId(passage.id, take.id)}
      data-take={take.id}
      data-on-key={onTake === take.id ? 'true' : undefined}
      className={`flex flex-col gap-1 border-l-[3px] px-2.5 py-1.5 ${onTake === take.id ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-transparent'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-['IBM_Plex_Mono',ui-monospace,monospace] font-medium">{take.label}</span>
        <StatusBadge tone={state.tone} label={state.label} shape="tag" />
        {suggestedId === take.id ? <StatusBadge tone="accent" label="Suggested" shape="tag" /> : null}
        <span className="min-w-[3rem] flex-1" style={{ maxWidth: `${Math.max(3, Math.round(take.sourceLength * 16))}px` }}>
          <MiniWave id={take.id} seconds={take.sourceLength} />
        </span>
        <span
          className="ml-auto font-['IBM_Plex_Mono',ui-monospace,monospace] text-[var(--text-muted)]"
          title="Share of the script's words this take read as written"
        >
          {share === null ? '' : `${share}%`}
        </span>
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
      </div>
      <div className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-[12px] text-[var(--text-muted)]">
        {take.sourceLength.toFixed(0)} s{take.evidence ? ` · ${placedLabel(take.evidence.via)}` : ''}
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
      className="flex flex-col gap-2 border-l border-[var(--line)] pl-3"
    >
      <Suggested suggestion={suggestion} labelOf={labelOf} />
      <div className="flex flex-col divide-y divide-[var(--line)]">
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
