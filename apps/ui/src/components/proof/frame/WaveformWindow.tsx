import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { IconButton } from '../../primitives/IconButton';
import { TooltipTarget } from '../../primitives/Tooltip';
import { PeaksCanvas } from './PeaksCanvas';
import type { PeaksSegment } from './peaksJoin';
import { clusterPins, earliestInView, type Band, type Pin } from './pins';
import { centreWindow, clock, edgeStep, followSecond, MIN_WINDOW, nudgeWindow, resizeWindow, stepLength, zoomWindow, type TimeWindow } from './windowMath';

const WAVE_HEIGHT = 84;
const OVERVIEW_HEIGHT = 34;
/** Width assumed where nothing can be measured (jsdom), so pins cluster the same everywhere. */
const FALLBACK_WIDTH = 860;

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => setWidth(Math.max(1, Math.round(element.clientWidth)) || FALLBACK_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export type WaveformWindowProps = {
  /** The chapter's length in seconds. */
  total: number;
  window: TimeWindow;
  onWindowChange: (window: TimeWindow) => void;
  segments: readonly PeaksSegment[];
  pins: readonly Pin[];
  bands?: readonly Band[];
  /** The playhead, in seconds, or null. */
  playhead?: number | null;
  selectedId: string | null;
  onPin: (id: string) => void;
  /** The notes in this chapter, for the waveform's name. */
  noteCount: number;
};

/**
 * The windowed waveform: an overview of the whole chapter with a draggable window (its edges are handles that resize it), and below it the
 * zoomed waveform with the note pins, bands and playhead. Pins, bands and the window are props, so nothing here knows about findings or takes.
 * The window follows the selected pin; moving it off the selection selects the earliest pin in view.
 */
export function WaveformWindow({
  total,
  window: win,
  onWindowChange,
  segments,
  pins,
  bands = [],
  playhead = null,
  selectedId,
  onPin,
  noteCount,
}: WaveformWindowProps) {
  const [waveRef, width] = useWidth();
  const overviewRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const grab = useRef(0);
  const edge = useRef<'start' | 'end' | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [latest, setLatest] = useState(win);

  // The window follows the selected note: one outside the window centres it, one inside leaves it.
  const selected = pins.find((pin) => pin.id === selectedId);
  useLayoutEffect(() => {
    if (!selected) return;
    const next = followSecond(win, selected.sec, total);
    if (next !== win) onWindowChange(next);
    // Only a change of selection follows; the window moving by hand must not pull itself back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => setLatest(win), [win]);

  /** After a window move settles, a selection left out of view gives way to the earliest note in view. */
  const settle = (next: TimeWindow): void => {
    if (selected && (selected.sec < next.start || selected.sec > next.start + next.len)) {
      const first = earliestInView(pins, next.start, next.len);
      if (first) onPin(first.id);
    }
  };
  const change = (next: TimeWindow, settled: boolean): void => {
    setLatest(next);
    onWindowChange(next);
    if (settled) settle(next);
  };

  const secAt = (event: PointerEvent): number => {
    const rect = overviewRef.current?.getBoundingClientRect();
    return rect && rect.width ? ((event.clientX - rect.left) / rect.width) * total : 0;
  };
  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || edge.current) return;
    dragging.current = true;
    const at = secAt(event);
    grab.current = at >= win.start && at <= win.start + win.len ? at - (win.start + win.len / 2) : 0;
    setGrabbing(true);
    change(centreWindow(win, at - grab.current, total), false);
    try {
      overviewRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Not every environment can capture the pointer.
    }
  };
  const onMove = (event: PointerEvent): void => {
    if (dragging.current) change(centreWindow(win, secAt(event) - grab.current, total), false);
    else if (edge.current) change(resizeWindow(win, edge.current, secAt(event), total), false);
  };
  const onUp = (): void => {
    if (!dragging.current && !edge.current) return;
    dragging.current = false;
    edge.current = null;
    setGrabbing(false);
    settle(latest);
  };

  const arrow = (event: KeyboardEvent): -1 | 1 | 0 => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return 0;
    // The page's chapter-step arrows must not also fire.
    event.preventDefault();
    event.stopPropagation();
    return event.key === 'ArrowRight' ? 1 : -1;
  };
  const onWindowKey = (event: KeyboardEvent): void => {
    const dir = arrow(event);
    if (dir) change(nudgeWindow(win, dir, total, event.shiftKey), true);
  };
  const onEdgeKey = (which: 'start' | 'end') => (event: KeyboardEvent) => {
    const dir = arrow(event);
    if (dir) change(resizeWindow(win, which, (which === 'start' ? win.start : win.start + win.len) + dir * edgeStep(event.shiftKey), total), true);
  };

  const min = Math.min(MIN_WINDOW, total);
  const end = win.start + win.len;
  const handle = (which: 'start' | 'end') => {
    const here = which === 'start' ? win.start : end;
    const low = which === 'start' ? 0 : win.start + min;
    const high = which === 'start' ? end - min : total;
    return (
      <span
        key={which}
        role="slider"
        tabIndex={0}
        aria-label={which === 'start' ? 'Window start' : 'Window end'}
        aria-orientation="horizontal"
        aria-valuemin={Math.round(low)}
        aria-valuemax={Math.round(high)}
        aria-valuenow={Math.round(here)}
        aria-valuetext={clock(here)}
        data-edge={which}
        className="absolute top-0 h-full w-3 -translate-x-1/2 cursor-ew-resize touch-none rounded bg-[var(--accent)] opacity-60 hover:opacity-100 focus-visible:opacity-100"
        style={{ left: `${(here / total) * 100}%` }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          edge.current = which;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Not every environment can capture the pointer.
          }
        }}
        onPointerMove={(event) => edge.current === which && onMove(event)}
        onPointerUp={(event) => {
          event.stopPropagation();
          onUp();
        }}
        onKeyDown={onEdgeKey(which)}
      />
    );
  };

  const zoomOutTo = stepLength(win.len, 1, total);
  const zoomInTo = stepLength(win.len, -1, total);
  const zoom = (dir: 1 | -1): void => {
    const next = zoomWindow(win, dir, total);
    if (next) change(next, true);
  };
  const clusters = clusterPins(pins, win.start, win.len, width, selectedId);
  const x = (sec: number): number => ((sec - win.start) / win.len) * 100;
  const label = `Chapter waveform, ${clock(win.start)} to ${clock(end)}, ${noteCount} ${noteCount === 1 ? 'note' : 'notes'} in this chapter`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--text-muted)]">Showing</span>
        <span className="font-mono text-[var(--text)]" data-window-label>
          {clock(win.start)}–{clock(end)}
        </span>
        <span className="flex-1" />
        <TooltipTarget text="Zoom out">
          <IconButton action="zoomOut" disabledReason={zoomOutTo == null ? 'Zoom out' : undefined} onClick={() => zoom(1)} />
        </TooltipTarget>
        <TooltipTarget text="Zoom in">
          <IconButton action="zoomIn" disabledReason={zoomInTo == null ? 'Zoom in' : undefined} onClick={() => zoom(-1)} />
        </TooltipTarget>
      </div>

      <div
        ref={overviewRef}
        data-overview
        data-grabbing={grabbing || undefined}
        className="relative touch-none select-none"
        style={{ height: OVERVIEW_HEIGHT }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <div className="absolute inset-0">
          <PeaksCanvas segments={segments} from={0} to={total} height={OVERVIEW_HEIGHT} playhead={playhead} />
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Window"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Math.round(Math.max(0, total - win.len))}
          aria-valuenow={Math.round(win.start)}
          aria-valuetext={`Showing ${clock(win.start)} to ${clock(end)}`}
          className="absolute top-0 h-full cursor-grab rounded border-2 border-[var(--accent)] bg-[var(--accent-soft)] opacity-50 focus-visible:opacity-90"
          style={{ left: `${(win.start / total) * 100}%`, width: `${Math.max(0.8, (win.len / total) * 100)}%` }}
          onKeyDown={onWindowKey}
        />
        {handle('start')}
        {handle('end')}
      </div>

      <div ref={waveRef} role="group" aria-label={label} className="relative" style={{ height: WAVE_HEIGHT }}>
        <PeaksCanvas segments={segments} from={win.start} to={end} height={WAVE_HEIGHT} playhead={playhead} />
        {bands.map((band) => {
          const x0 = Math.max(0, x(band.start));
          const x1 = Math.min(100, x(band.end));
          if (x1 <= x0) return null;
          return (
            <div
              key={band.id}
              data-band={band.id}
              className={`pointer-events-none absolute inset-y-1 overflow-hidden rounded border text-xs ${band.tone === 'ok' ? 'border-[var(--ok)] bg-[var(--ok-soft)] text-[var(--ok-text)]' : 'border-[var(--line-strong)] text-[var(--text-muted)]'}`}
              style={{ left: `${x0}%`, width: `${x1 - x0}%` }}
            >
              <span className="px-1">{band.label}</span>
            </div>
          );
        })}
        {clusters.map((cluster) => {
          if (cluster.pins.length > 1) {
            const mid = ((cluster.x0 + cluster.x1) / 2 / width) * 100;
            return (
              // native-control-ok: a pin is placed on the waveform by time and must be a plain focusable mark; no primitive positions itself.
              <button
                key={cluster.pins[0].id}
                type="button"
                aria-label={`${cluster.pins.length} notes`}
                data-cluster={cluster.pins.map((p) => p.id).join(',')}
                onClick={() => onPin(cluster.pins[0].id)}
                className="absolute top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[var(--text)] bg-[var(--surface)] text-xs font-bold text-[var(--text)]"
                style={{ left: `${mid}%` }}
              >
                {cluster.pins.length}
              </button>
            );
          }
          const pin = cluster.pins[0];
          const isSelected = pin.id === selectedId;
          return (
            // native-control-ok: a pin is placed on the waveform by time and must be a plain focusable mark; no primitive positions itself.
            <button
              key={pin.id}
              type="button"
              aria-label={pin.label}
              aria-pressed={isSelected}
              data-pin={pin.id}
              data-hollow={pin.done || undefined}
              onClick={() => onPin(pin.id)}
              className={`absolute top-0 -translate-x-1/2 rounded-full border-2 ${isSelected ? 'size-4' : 'size-3'}`}
              style={{ left: `${(cluster.x0 / width) * 100}%`, borderColor: pin.colour, background: pin.done ? 'var(--surface)' : pin.colour }}
            />
          );
        })}
        {playhead != null && playhead >= win.start && playhead <= end ? (
          <div aria-hidden="true" data-playhead className="absolute top-0 h-full w-0.5 bg-[var(--text)]" style={{ left: `${x(playhead)}%` }} />
        ) : null}
      </div>
    </div>
  );
}
