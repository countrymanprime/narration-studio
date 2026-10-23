import { useCallback, useEffect, useRef, useState } from 'react';
import { centreWindow, EDITING_SCALE, followSecond, nudgeWindow, stepLength, zoomWindow, zoomWindowAt, type TimeWindow } from '../../proof/frame/windowMath';

/** Wheel distance that makes one zoom step: a notched mouse wheel is 100 a notch, a trackpad pinch sends many small ones. */
const WHEEL_STEP = 50;
/** A pause this long (ms) between wheel events starts the next gesture from zero. */
const WHEEL_PAUSE = 250;
/** Pixels in one wheel line, for a wheel that reports lines rather than pixels (`deltaMode` 1). */
const LINE_PX = 16;

export interface RibbonView {
  /** The part of the waveform on screen, in seconds from its start. */
  view: TimeWindow;
  /** The waveform's whole length, in seconds. */
  total: number;
  /** True when the view shows less than the whole length. */
  zoomed: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  /** True when the view can scroll back (toward the start) or forward. */
  canBack: boolean;
  canForward: boolean;
  zoom: (dir: 1 | -1) => void;
  /** Zooms one step about a time (seconds from the start), so that time stays where it is. */
  zoomAt: (dir: 1 | -1, at: number) => void;
  /** Whole-window pan: a tenth of the window, all of it when `big`. */
  nudge: (dir: 1 | -1, big?: boolean) => void;
  /** Moves the view so it starts at `start` (seconds from the waveform's start), kept inside it. A hand scroll. */
  scrollTo: (start: number) => void;
  /** Moves the view so its centre is at `centre` (seconds from the start). A hand scroll. */
  centreOn: (centre: number) => void;
  /** Shows a stretch (seconds from the start), at least the closest zoom long. */
  show: (window: TimeWindow) => void;
  /** Brings a time (seconds from the start) into view without moving the view when it is in it. */
  reveal: (sec: number) => void;
}

export interface RibbonViewOptions {
  /** The view to open with; else `focus`, else the whole length. */
  initial?: TimeWindow;
  /**
   * The stretch the view keeps in sight (the active line). When it changes and is not already wholly on screen, the view moves to it; a
   * narrower view keeps its zoom and centres on it.
   */
  focus?: TimeWindow | null;
  /** Changed by the caller to bring `focus` back into view even when it has not moved (the page let a scrolled view go). */
  refocus?: number;
  /** Called with the new view after every scroll by hand (a drag, the wheel, an arrow), not after a zoom or a follow. */
  onScroll?: (view: TimeWindow) => void;
}

const clampTo = (w: TimeWindow, total: number): TimeWindow =>
  centreWindow({ start: 0, len: Math.min(Math.max(w.len, 0), total) }, w.start + w.len / 2, total, EDITING_SCALE);

/**
 * Which part of the waveform shows, and how it zooms and scrolls (the Proof waveform's window maths on the finer Editing scale). The view
 * follows the playhead out of the window; scrolling by hand while it plays stops that until playback stops, so the narrator is not pulled
 * back. The wheel and a two-finger swipe scroll it sideways (a vertical wheel too: the waveform has no vertical scroll), and a control-wheel
 * (a trackpad pinch) zooms about the pointer. `surface` is the element the wheel acts on; it is state because the waveform only exists once
 * its audio has arrived.
 */
export function useRibbonView(total: number, playhead: number | null, surface: HTMLElement | null, options: RibbonViewOptions = {}): RibbonView {
  const { initial, focus = null, onScroll, refocus = 0 } = options;
  const [view, setView] = useState<TimeWindow>(() => ((initial ?? focus) ? clampTo((initial ?? focus) as TimeWindow, total) : { start: 0, len: total }));
  const held = useRef(false);
  // The narrator zoomed in by hand: a new line keeps that zoom rather than showing all of itself.
  const handZoom = useRef(false);

  // A waveform that changes length (re-timed by a cut, another chapter) keeps what it can of the view.
  useEffect(() => {
    setView((v) => (total <= 0 ? { start: 0, len: 0 } : clampTo({ start: v.start, len: v.len || total }, total)));
  }, [total]);

  // A new active line comes into view; a line already wholly on screen leaves the view as it is.
  const focusStart = focus?.start;
  const focusLen = focus?.len;
  useEffect(() => {
    if (focusStart === undefined || focusLen === undefined || total <= 0) return;
    setView((v) => {
      if (focusStart >= v.start - 1e-6 && focusStart + focusLen <= v.start + v.len + 1e-6) return v;
      const len = handZoom.current && v.len < focusLen ? v.len : focusLen;
      return clampTo({ start: focusStart + focusLen / 2 - len / 2, len }, total);
    });
  }, [focusStart, focusLen, total, refocus]);

  // The playhead leaving the window brings it back, unless the narrator moved the window since playback began.
  useEffect(() => {
    if (playhead == null) {
      held.current = false;
      return;
    }
    if (held.current) return;
    setView((v) => (v.len < total ? followSecond(v, playhead, total, EDITING_SCALE) : v));
  }, [playhead, total]);

  const scrolled = useRef(onScroll);
  useEffect(() => {
    scrolled.current = onScroll;
  });
  const apply = useCallback(
    (next: TimeWindow | null, byScroll: boolean) => {
      if (!next) return;
      if (playhead != null) held.current = true;
      setView(next);
      if (byScroll) scrolled.current?.(next);
    },
    [playhead],
  );

  const zoomed = useCallback(
    (next: TimeWindow | null) => {
      if (next) handZoom.current = true;
      apply(next, false);
    },
    [apply],
  );
  const zoom = useCallback((dir: 1 | -1) => zoomed(zoomWindow(view, dir, total, EDITING_SCALE)), [view, total, zoomed]);
  const zoomAt = useCallback((dir: 1 | -1, at: number) => zoomed(zoomWindowAt(view, dir, total, at, EDITING_SCALE)), [view, total, zoomed]);
  const nudge = useCallback((dir: 1 | -1, big = false) => apply(nudgeWindow(view, dir, total, big, EDITING_SCALE), true), [view, total, apply]);
  const centreOn = useCallback((centre: number) => apply(centreWindow(view, centre, total, EDITING_SCALE), true), [view, total, apply]);
  const scrollTo = useCallback((start: number) => apply(centreWindow(view, start + view.len / 2, total, EDITING_SCALE), true), [view, total, apply]);
  const show = useCallback(
    (w: TimeWindow) => {
      handZoom.current = false;
      apply(clampTo(w, total), false);
    },
    [total, apply],
  );
  const reveal = useCallback(
    (sec: number) => {
      const next = followSecond(view, sec, total, EDITING_SCALE);
      if (next !== view) setView(next);
    },
    [view, total],
  );

  // Wheel gestures need a non-passive listener to keep the page from zooming or scrolling under them, which a React handler cannot be.
  const latest = useRef({ view, total, apply });
  useEffect(() => {
    latest.current = { view, total, apply };
  });
  useEffect(() => {
    const el = surface;
    if (!el) return;
    let sum = 0;
    let last = 0;
    const onWheel = (event: WheelEvent): void => {
      const { view: v, total: len, apply: set } = latest.current;
      const rect = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (event.timeStamp - last > WHEEL_PAUSE || Math.sign(event.deltaY) !== Math.sign(sum)) sum = 0;
        last = event.timeStamp;
        sum += event.deltaY;
        if (Math.abs(sum) < WHEEL_STEP) return;
        const dir = sum < 0 ? -1 : 1;
        sum = 0;
        const at = v.start + (rect.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0.5) * v.len;
        handZoom.current = true;
        set(zoomWindowAt(v, dir, len, at, EDITING_SCALE), false);
        return;
      }
      // The larger of the two directions scrolls: a two-finger swipe sideways, or the wheel up and down.
      const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      event.preventDefault();
      if (!raw || v.len >= len) return;
      const px = raw * (event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? rect.width || 1 : 1);
      const seconds = (px / (rect.width || 1)) * v.len;
      set(centreWindow(v, v.start + v.len / 2 + seconds, len, EDITING_SCALE), true);
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
    canBack: view.start > 1e-6,
    canForward: view.start + view.len < total - 1e-6,
    zoom,
    zoomAt,
    nudge,
    scrollTo,
    centreOn,
    show,
    reveal,
  };
}
