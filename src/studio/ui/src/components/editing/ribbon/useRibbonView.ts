import { useCallback, useEffect, useRef, useState } from 'react';
import { centreWindow, EDITING_SCALE, followSecond, nudgeWindow, stepLength, zoomWindow, zoomWindowAt, type TimeWindow } from '../../proof/frame/windowMath';

/** Wheel distance that makes one zoom step: a notched mouse wheel is 100 a notch, a trackpad pinch sends many small ones. */
const WHEEL_STEP = 50;
/** A pause this long (ms) between wheel events starts the next gesture from zero. */
const WHEEL_PAUSE = 250;
/** A full wheel notch pans this fraction of the window. */
const WHEEL_PAN = 0.1;

export interface RibbonView {
  /** The part of the paragraph on screen, in seconds from its start. */
  view: TimeWindow;
  /** The paragraph's length, in seconds. */
  total: number;
  /** True when the view shows less than the whole paragraph. */
  zoomed: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoom: (dir: 1 | -1) => void;
  /** Whole-window arrow-key pan: a tenth of the window, all of it when `big`. */
  nudge: (dir: 1 | -1, big?: boolean) => void;
  /** Moves the view so its centre is at `centre` (seconds from the paragraph's start). */
  centreOn: (centre: number) => void;
  /** Brings a time (seconds from the paragraph's start) into view without moving the view when it is in it. */
  reveal: (sec: number) => void;
}

/**
 * Which part of a paragraph the Editing waveform shows, and how it zooms and pans (the Proof waveform's window maths on the finer Editing scale).
 * The view follows the playhead out of the window; panning by hand while the line plays stops that until playback stops, so the narrator is not
 * pulled back. A control-wheel (a pinch on a trackpad) zooms about the pointer; a sideways or Shift wheel pans. `surface` is the element the wheel acts on; it is state because the waveform only exists once its audio has arrived. `initial` is the view it opens with.
 */
export function useRibbonView(total: number, playhead: number | null, surface: HTMLElement | null, initial?: TimeWindow): RibbonView {
  const [view, setView] = useState<TimeWindow>(initial ?? { start: 0, len: total });
  const held = useRef(false);

  // A paragraph that changes length (re-timed by a cut) keeps what it can of the view.
  useEffect(() => {
    setView((v) =>
      total <= 0 ? { start: 0, len: 0 } : centreWindow({ start: 0, len: Math.min(v.len || total, total) }, v.start + v.len / 2, total, EDITING_SCALE),
    );
  }, [total]);

  // The playhead leaving the window brings it back, unless the narrator moved the window since the line began to play.
  useEffect(() => {
    if (playhead == null) {
      held.current = false;
      return;
    }
    if (held.current) return;
    setView((v) => (v.len < total ? followSecond(v, playhead, total, EDITING_SCALE) : v));
  }, [playhead, total]);

  const byHand = useCallback(
    (next: TimeWindow | null) => {
      if (!next) return;
      if (playhead != null) held.current = true;
      setView(next);
    },
    [playhead],
  );

  const zoom = useCallback((dir: 1 | -1) => byHand(zoomWindow(view, dir, total, EDITING_SCALE)), [view, total, byHand]);
  const nudge = useCallback((dir: 1 | -1, big = false) => byHand(nudgeWindow(view, dir, total, big, EDITING_SCALE)), [view, total, byHand]);
  const centreOn = useCallback((centre: number) => byHand(centreWindow(view, centre, total, EDITING_SCALE)), [view, total, byHand]);
  const reveal = useCallback(
    (sec: number) => {
      const next = followSecond(view, sec, total, EDITING_SCALE);
      if (next !== view) setView(next);
    },
    [view, total],
  );

  // Wheel gestures need a non-passive listener to keep the page from zooming or scrolling under them, which a React handler cannot be.
  const latest = useRef({ view, total, byHand });
  useEffect(() => {
    latest.current = { view, total, byHand };
  });
  useEffect(() => {
    const el = surface;
    if (!el) return;
    let sum = 0;
    let last = 0;
    const onWheel = (event: WheelEvent): void => {
      const { view: v, total: len, byHand: apply } = latest.current;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (event.timeStamp - last > WHEEL_PAUSE || Math.sign(event.deltaY) !== Math.sign(sum)) sum = 0;
        last = event.timeStamp;
        sum += event.deltaY;
        if (Math.abs(sum) < WHEEL_STEP) return;
        const dir = sum < 0 ? -1 : 1;
        sum = 0;
        const rect = el.getBoundingClientRect();
        const at = v.start + (rect.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0.5) * v.len;
        apply(zoomWindowAt(v, dir, len, at, EDITING_SCALE));
        return;
      }
      const delta = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      if (!delta || v.len >= len) return;
      event.preventDefault();
      apply(centreWindow(v, v.start + v.len / 2 + (delta / 100) * WHEEL_PAN * v.len, len, EDITING_SCALE));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [surface]);

  return {
    view,
    total,
    zoomed: view.len < total - 1e-6,
    canZoomIn: stepLength(view.len, -1, total, EDITING_SCALE) != null,
    canZoomOut: stepLength(view.len, 1, total, EDITING_SCALE) != null,
    zoom,
    nudge,
    centreOn,
    reveal,
  };
}
