import { useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button } from '../../primitives/Button';
import { StatusBadge } from '../../primitives/StatusBadge';
import { useEditingPage } from '../script/EditingPageState';
import { RibbonView } from '../ribbon/Ribbon';
import { activePid, ribbonLayout } from '../ribbon/ribbonLayout';
import { pickEntry, useRibbonPeaks } from '../ribbon/useRibbonPeaks';
import { MiniWave } from '../takes/MiniWave';
import type { LinePassage, LineTake } from '../takes/types';
import { stripLayout, wordAtTime } from './stripLayout';

/**
 * The strip is offered at the Studio Next mock's `STRIP_MIN_WIDTH`, 1360 px, measured on the page root (a container query, not the window). The
 * root carries `@container`; everything the width decides carries these classes.
 */
const STRIP_ROOT = '@container';
export const STRIP_OFFERED = 'hidden @min-[1360px]:block';

const mono = "font-['IBM_Plex_Mono',ui-monospace,monospace]";
const pct = (t: number, t0: number, t1: number): string => `${(((t - t0) / (t1 - t0)) * 100).toFixed(2)}%`;
const clock = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** The header button that shows and hides the strip. Not rendered below 1360 px of the page root. */
export function StripToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <span className={STRIP_OFFERED}>
      <Button variant="secondary" size="sm" id="striptoggle" aria-pressed={open} aria-keyshortcuts="S" onClick={onToggle}>
        Timeline
      </Button>
    </span>
  );
}

/** Puts the `@container` root around the page the strip and its toggle sit in. */
export function StripRoot({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${STRIP_ROOT} ${className}`}>{children}</div>;
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
  chapterId: string;
  /** Drawn in the drawer's Timeline tab, which is offered only where the strip does not fit: shown at every width, not only from 1360 px. */
  inDrawer?: boolean;
}

/**
 * The chapter's audio under the line the cursor is on, and one lane for each shown take of that line, all on one time axis with one playhead.
 * The selection is mirrored as a band; dragging on the audio selects the words under it (the selection keys do the same from the keyboard), and a
 * lane plays its take.
 */
export function TimelineStrip({ passage, hidden, starts = {}, playingId, onPlay, chapterId, inDrawer = false }: TimelineStripProps) {
  const { doc, state, dispatch, selected: cursorOrSel } = useEditingPage();
  // The cursor's own word is not a selection: no band until a run is selected.
  const selected = useMemo(() => (state.sel ? cursorOrSel : []), [state.sel, cursorOrSel]);
  const peaks = useRibbonPeaks(chapterId);
  const audio = useRef<HTMLDivElement>(null);
  const drag = useRef<string | null>(null);
  const pid = activePid(doc, state);
  const takes = useMemo(() => (passage?.takes ?? []).filter((t) => !hidden?.has(t.id)), [passage, hidden]);
  const layout = useMemo(() => (pid ? stripLayout(doc, pid, takes, starts, selected, state.playT) : null), [doc, pid, takes, starts, selected, state.playT]);
  const base = useMemo(() => (pid && layout ? ribbonLayout(doc, pid, selected, null) : null), [doc, pid, layout, selected]);

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
  const region = `${inDrawer ? '' : STRIP_OFFERED} border-t border-[var(--border)] bg-[var(--surface)] text-[var(--text)]`;
  if (!layout || !base) {
    return (
      <section id="timeline" aria-label="Waveform and takes, following the line the cursor is on" className={region}>
        {head}
      </section>
    );
  }

  const { t0, t1 } = layout;
  const at = (clientX: number): number => {
    const r = audio.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return t0;
    return t0 + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (t1 - t0);
  };
  const down = (e: ReactPointerEvent): void => {
    const key = wordAtTime(doc, layout.pid, at(e.clientX));
    drag.current = key;
    if (key) dispatch({ type: 'place', key });
  };
  const move = (e: ReactPointerEvent): void => {
    if (!drag.current || e.buttons !== 1) return;
    const key = wordAtTime(doc, layout.pid, at(e.clientX));
    if (key) dispatch({ type: 'select', anchor: drag.current, head: key });
  };
  const up = (): void => {
    drag.current = null;
  };
  const audioLayout = { ...base, t0, t1, playhead: layout.playhead, band: layout.band && { t0: layout.band.t0, t1: layout.band.t1 } };
  const entry = pickEntry(peaks, t0, t1);

  return (
    <section id="timeline" aria-label="Waveform and takes, following the line the cursor is on" className={region}>
      {head}
      <div className="flex items-stretch gap-2 px-3" data-lane="audio">
        <div className="flex w-24 flex-none flex-col justify-center text-xs">
          <span className="font-semibold">Audio</span>
          <span className="text-[var(--text-muted)]">{passage?.takes.find((t) => t.active)?.label ?? 'Recording'}</span>
        </div>
        <div ref={audio} data-tl-audio className="min-w-0 flex-1 touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
          <RibbonView layout={audioLayout} {...('peaks' in entry ? { peaks: entry.peaks } : { reason: entry.reason })} />
        </div>
      </div>
      {layout.lanes.map(({ take, start, length }) => (
        <div key={take.id} className="flex items-center gap-2 px-3 py-0.5" data-lane={take.id}>
          <div className="flex w-24 flex-none items-center gap-1.5 text-xs">
            <span className={`${mono} font-medium`}>{take.label}</span>
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
            >
              <MiniWave id={take.id} seconds={length} />
            </span>
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
      <div className={`${mono} ml-[6.5rem] flex justify-between px-3 pb-1.5 text-xs text-[var(--text-muted)]`} aria-hidden="true">
        <span>{clock(t0)}</span>
        <span>{clock((t0 + t1) / 2)}</span>
        <span>{clock(t1)}</span>
      </div>
    </section>
  );
}
