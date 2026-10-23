import { useMemo } from 'react';
import { IconButton } from '../../primitives/IconButton';
import { TooltipTarget } from '../../primitives/Tooltip';
import { StatusBadge } from '../../primitives/StatusBadge';
import { useEditingPage } from '../script/EditingPageState';
import { activePid } from '../ribbon/ribbonLayout';
import type { LinePassage, LineTake } from '../takes/types';
import { stripLayout } from './stripLayout';

const mono = "font-['IBM_Plex_Mono',ui-monospace,monospace]";
const pct = (t: number, t0: number, t1: number): string => `${(((t - t0) / (t1 - t0)) * 100).toFixed(2)}%`;
const clock = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** The header button that shows and hides the strip. The page offers it from a 1360 px window (`useStripFits`), as the mock does. */
export function StripToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <TooltipTarget text="Timeline strip (S)">
      <IconButton
        action="timelineStrip"
        label="Timeline"
        id="striptoggle"
        aria-pressed={open}
        aria-keyshortcuts="S"
        onClick={onToggle}
        className={open ? 'border-[var(--accent)] text-[var(--accent)]' : ''}
      />
    </TooltipTarget>
  );
}

export interface TimelineStripProps {
  /** The cursor line's passage, or null for a line with no takes. */
  passage: LinePassage | null;
  /** Takes the narrator hid: they have no lane. */
  hidden?: ReadonlySet<string>;
  /** Where each take begins on the document's clock; a take missing here sits on the line's start (a stacked passage). */
  starts?: Readonly<Record<string, number>>;
  /** The take playing now, or null. */
  playingId: string | null;
  /** Plays the take's own source range through the playback hook; called again for the take that plays, it stops. */
  onPlay: (take: LineTake) => void;
  /** Drawn in the drawer's Timeline tab, which is offered only where the strip does not fit: shown at every width, not only from 1360 px. */
  inDrawer?: boolean;
}

/**
 * One lane for each shown take of the line the cursor is on, all on one time axis with one playhead; the selection is mirrored as a band on the
 * active take, and a lane plays its take. The line's audio is not drawn here: the page has one waveform, docked above the transport (#2251,
 * item 29).
 */
export function TimelineStrip({ passage, hidden, starts = {}, playingId, onPlay, inDrawer = false }: TimelineStripProps) {
  const { doc, state, selected: cursorOrSel } = useEditingPage();
  // The cursor's own word is not a selection: no band until a run is selected.
  const selected = useMemo(() => (state.sel ? cursorOrSel : []), [state.sel, cursorOrSel]);
  const pid = activePid(doc, state);
  const takes = useMemo(() => (passage?.takes ?? []).filter((t) => !hidden?.has(t.id)), [passage, hidden]);
  const layout = useMemo(() => (pid ? stripLayout(doc, pid, takes, starts, selected, state.playT) : null), [doc, pid, takes, starts, selected, state.playT]);

  const head = (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="font-['Barlow_Condensed',sans-serif] text-[11px] font-semibold tracking-[var(--tracking-button)] text-[var(--text-muted)] uppercase">
        Timeline
      </span>
      {layout ? (
        <span className={`${mono} text-xs text-[var(--text-muted)]`}>
          {clock(layout.t0)} to {clock(layout.t1)}
        </span>
      ) : null}
      {layout?.band ? <StatusBadge tone="info" label={`${layout.band.length.toFixed(1)} s`} shape="tag" /> : null}
    </div>
  );
  // The drawer stacks a take's name over its badge, so the column is as wide as the longest name ("Retake on lane 2") on one line.
  const labelWidth = inDrawer ? 'w-[7.5rem]' : 'w-24';
  const region = `border-t border-[var(--border)] bg-[var(--surface)] text-[var(--text)]`;
  if (!layout) {
    return (
      <section id="timeline" aria-label="Waveform and takes, following the line the cursor is on" className={region}>
        {head}
      </section>
    );
  }

  const { t0, t1 } = layout;

  return (
    <section id="timeline" aria-label="Waveform and takes, following the line the cursor is on" className={region}>
      {head}
      {layout.lanes.map(({ take, start, length }) => (
        <div key={take.id} className="flex items-center gap-2 px-3 py-0.5" data-lane={take.id}>
          <div className={`flex ${labelWidth} flex-none text-xs ${inDrawer ? 'flex-col items-start gap-0.5' : 'items-center gap-1.5'}`}>
            <span className={`${mono} font-medium whitespace-nowrap`}>{take.label}</span>
            <StatusBadge tone={take.active ? 'info' : 'neutral'} label={take.active ? 'Active' : 'Muted'} shape="tag" />
          </div>
          {/* native-control-ok: the whole lane is the button, a bar the take is drawn in; Button's padded uppercase chrome cannot draw it. */}
          <button
            type="button"
            className="relative h-7 min-w-0 flex-1 cursor-pointer overflow-hidden rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            aria-label={`${playingId === take.id ? 'Stop' : 'Play'} take ${take.label}`}
            aria-pressed={playingId === take.id}
            onClick={() => onPlay(take)}
          >
            <span
              className={`absolute inset-y-0.5 block overflow-hidden rounded-[var(--radius-button)] ${take.active ? 'bg-[var(--info-soft)]' : 'bg-[var(--surface)]'}`}
              style={{ left: pct(start, t0, t1), width: `${((length / (t1 - t0)) * 100).toFixed(2)}%` }}
            ></span>
            {layout.band && take.active ? (
              <i
                data-selband
                className="absolute inset-y-0 bg-[var(--info)] opacity-25"
                style={{ left: pct(layout.band.t0, t0, t1), width: `${(((layout.band.t1 - layout.band.t0) / (t1 - t0)) * 100).toFixed(2)}%` }}
              />
            ) : null}
            {layout.playhead != null ? (
              <i data-now className="absolute inset-y-0 w-px bg-[var(--accent)]" style={{ left: pct(layout.playhead, t0, t1) }} />
            ) : null}
          </button>
        </div>
      ))}
      <div
        className={`${mono} ${inDrawer ? 'ml-[8.5rem]' : 'ml-[6.5rem]'} flex justify-between px-3 pb-1.5 text-xs text-[var(--text-muted)]`}
        aria-hidden="true"
      >
        <span>{clock(t0)}</span>
        <span>{clock((t0 + t1) / 2)}</span>
        <span>{clock(t1)}</span>
      </div>
    </section>
  );
}
