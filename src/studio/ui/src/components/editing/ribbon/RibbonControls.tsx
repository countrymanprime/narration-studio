import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { IconButton } from '../../primitives/IconButton';
import { capturePointer } from './pointerCapture';
import { fineClock } from './rangeMath';
import type { RibbonView } from './useRibbonView';

/** The row above the waveform: what part of the line it shows, and the zoom buttons. */
export function ZoomRow({ t0, ribbon }: { t0: number; ribbon: RibbonView }) {
  const { view, canZoomIn, canZoomOut, zoom } = ribbon;
  return (
    <div className="flex items-center gap-2 px-3 pt-1.5 text-xs text-[var(--text-muted)]">
      <span>Showing</span>
      <span className="font-mono text-[var(--text)]" data-view-label>
        {fineClock(t0 + view.start)} to {fineClock(t0 + view.start + view.len)}
      </span>
      <span className="flex-1" />
      <IconButton action="zoomOut" size="sm" disabledReason={canZoomOut ? undefined : 'The whole line is showing'} onClick={() => zoom(1)} />
      <IconButton action="zoomIn" size="sm" disabledReason={canZoomIn ? undefined : 'One second is the closest view'} onClick={() => zoom(-1)} />
    </div>
  );
}

/**
 * A thin strip under a zoomed waveform: its thumb is the part on screen. Drag the strip to pan, or use the arrow keys on the thumb (a tenth of the
 * window, all of it with Shift) and + and - to zoom.
 */
export function PanStrip({ t0, ribbon }: { t0: number; ribbon: RibbonView }) {
  const { view, total, nudge, zoom, centreOn } = ribbon;
  const track = useRef<HTMLDivElement>(null);
  const grab = useRef<number | null>(null);
  const secAt = (event: PointerEvent): number => {
    const rect = track.current?.getBoundingClientRect();
    return rect && rect.width ? ((event.clientX - rect.left) / rect.width) * total : 0;
  };
  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const at = secAt(event);
    grab.current = at >= view.start && at <= view.start + view.len ? at - (view.start + view.len / 2) : 0;
    centreOn(at - grab.current);
    if (track.current) capturePointer(track.current, event.pointerId);
  };
  const onMove = (event: PointerEvent): void => {
    if (grab.current !== null) centreOn(secAt(event) - grab.current);
  };
  const onUp = (): void => {
    grab.current = null;
  };
  const onKey = (event: KeyboardEvent): void => {
    const dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const step = event.key === '+' || event.key === '=' ? -1 : event.key === '-' || event.key === '_' ? 1 : 0;
    if (!dir && !step) return;
    // The page's own arrows step the word cursor.
    event.preventDefault();
    event.stopPropagation();
    if (dir) nudge(dir, event.shiftKey);
    else zoom(step as 1 | -1);
  };
  return (
    <div
      ref={track}
      data-ribbon-pan
      className="relative mx-3 mt-1 mb-1.5 h-3 cursor-pointer touch-none rounded-full border border-[var(--border)] bg-[var(--surface-2)]"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label="Visible part"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round((total - view.len) * 1000) / 1000}
        aria-valuenow={Math.round(view.start * 1000) / 1000}
        aria-valuetext={`Showing ${fineClock(t0 + view.start)} to ${fineClock(t0 + view.start + view.len)}`}
        className="absolute inset-y-0 cursor-grab rounded-full bg-[var(--accent)] opacity-60 focus-visible:opacity-100"
        style={{ left: `${(view.start / total) * 100}%`, width: `${Math.max(2, (view.len / total) * 100)}%` }}
        onKeyDown={onKey}
      />
    </div>
  );
}
