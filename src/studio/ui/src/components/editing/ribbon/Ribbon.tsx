import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { TimeWindow } from '../../proof/frame/windowMath';
import type { ContextMenuItem } from '../../primitives/ContextMenu';
import { useContextProvider } from '../../../registries/context';
import type { DocItem } from '../model';
import type { DocPeaks } from './docClock';
import { drawRibbon, readRibbonColors, STILL_FRAME, type RibbonColors, type RibbonFrame } from './drawRibbon';
import { peaksWindowAll } from './peaksWindow';
import { barLayout, FULL_SCALE, type PeakScale } from './ribbonBars';
import type { RibbonLayout } from './ribbonLayout';
import { RangeNotes, RangeOverlay } from './RangeOverlay';
import { fineClock, type Span } from './rangeMath';
import { ScrollEnd, ZoomRow } from './RibbonControls';
import { useRangeInteraction } from './useRangeInteraction';
import { useRibbonView } from './useRibbonView';
import { useScrollGestures } from './useScrollGestures';
import { useWaveSwell } from './useWaveSwell';
import { placeholderColumns } from './waveSwell';

/** The waveform's own height (CSS pixels): the lane, not the peaks in it. */
const HEIGHT = 56;
/**
 * The whole waveform's height when it is a place to choose (the bottom of the Editing page): the row above (32 px), the lane (66 px with its
 * border and padding) and three 16 px lines of notes under it, which a range's notes take at 768 px (a range, its partly covered words and
 * the sub-word preview). At 140 px the third line was cut by the dock's edge (alignment audit W3). Fixed, so a range, a note or a line
 * without audio never moves what is around it (#2251, item 29).
 */
const DOCK_HEIGHT = 146;
/** Width used where nothing can measure the canvas (a test environment without ResizeObserver). */
const FALLBACK_WIDTH = 640;

const clock = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** A peak bar wider than this many pixels is a block of audio, not a detail of it, and the waveform says so. */
const COARSE_PX = 10;

/** What makes the waveform a place to choose a range: the words, the range now, and what to do when it changes or is tapped. Without it the waveform only shows. */
interface RibbonRange {
  words: readonly DocItem[];
  range: Span | null;
  onRange: (span: Span, phase: 'drag' | 'commit') => void;
  /** A tap on the waveform (no drag) at a time on the document's clock. */
  onTap: (t: number) => void;
}

export interface RibbonViewProps {
  /** What is drawn, over the whole stretch the waveform can show (`t0` to `t1`, the document clock). */
  layout: RibbonLayout;
  /** The audio of that stretch: every item it runs across, each on the document clock (the layout's clock). */
  peaks?: readonly DocPeaks[];
  reason?: string;
  /** The active take's name (null for audio heard in the recording). Omitted, no name. */
  head?: { take: string | null };
  choose?: RibbonRange;
  /** The part to open on, seconds from `layout.t0`; else `focus`, else all of it. */
  initialView?: TimeWindow;
  /** The stretch the view keeps in sight, seconds from `layout.t0` (the active line). */
  focus?: TimeWindow | null;
  /** The view was scrolled by hand to this, seconds from `layout.t0`. */
  onScroll?: (view: TimeWindow) => void;
  /** Bumped to bring `focus` back into view (the page let the scrolled view go). */
  refocus?: number;
  /** How the peaks become heights (`peakScale`). */
  scale?: PeakScale;
  /** The text alternative of the stretch on screen; the layout's own when left out. */
  describe?: (t0: number, t1: number) => string;
  /** The waveform's menu items for a time on the document clock (null: opened from the keyboard), before its own view items. */
  menu?: (at: number | null) => ContextMenuItem[];
  /** The peaks are still being read: a flat row of placeholder bars with the swell running over it, instead of the reason. */
  loading?: boolean;
  /**
   * Draws the swell held still instead of running it, for a story or a screenshot that must be the same on every run: on the playhead when
   * there is one, else this phase (0..1) of the placeholder loop.
   */
  swellPhase?: number;
}

/**
 * A waveform over a stretch of the document clock, with word ticks, tints, the selection band and the playhead. With no peaks it draws nothing
 * and says why. Given `choose` it is the place to choose a range (left button, one finger), to scroll (right-drag, wheel, two fingers, the end
 * arrows and the keys) and to zoom (down to one second); it then keeps one height whatever it shows.
 */
export function RibbonView({
  layout,
  peaks,
  reason,
  head,
  choose,
  initialView,
  focus = null,
  onScroll,
  refocus,
  scale = FULL_SCALE,
  describe,
  menu,
  loading = false,
  swellPhase,
}: RibbonViewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  // Bumped when the root's `data-theme` or `data-motion` changes, or the system's motion setting does, so the draw re-reads the tokens and the motion choice.
  const [theme, setTheme] = useState(0);
  const descId = useId();
  const helpId = useId();
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const [loadingBox, setLoadingBox] = useState<HTMLDivElement | null>(null);
  const total = layout.t1 - layout.t0;
  const ribbon = useRibbonView(total, layout.playhead == null ? null : layout.playhead - layout.t0, surface, {
    initial: initialView,
    focus,
    onScroll,
    refocus,
  });
  const view = choose ? ribbon.view : { start: 0, len: total };
  // What is drawn is the view: the ticks, tints and cuts outside it are left out, so a chapter-long layout costs no more a frame than a line.
  const shownLayout = useMemo(() => {
    if (!choose) return layout;
    const t0 = layout.t0 + view.start;
    const t1 = t0 + view.len;
    const inView = (s: { t0: number; t1: number }): boolean => s.t1 >= t0 && s.t0 <= t1;
    return { ...layout, t0, t1, ticks: layout.ticks.filter((t) => t >= t0 && t <= t1), flags: layout.flags.filter(inView), cuts: layout.cuts.filter(inView) };
  }, [choose, layout, view.start, view.len]);
  const bounds = useMemo(() => ({ start: layout.t0, end: layout.t1 }), [layout.t0, layout.t1]);
  const interaction = useRangeInteraction({
    surface,
    t0: layout.t0,
    view: ribbon,
    bounds,
    words: choose?.words ?? [],
    range: choose?.range ?? null,
    onRange: choose?.onRange ?? (() => {}),
    onTap: choose?.onTap ?? (() => {}),
  });
  const touches = useRef(new Map<number, number>()).current;
  const scroll = useScrollGestures({ surface, view: ribbon, touches, onTwoFingers: interaction.cancel });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (typeof ResizeObserver === 'undefined') {
      setWidth(box.clientWidth || FALLBACK_WIDTH);
      return;
    }
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(box);
    return () => ro.disconnect();
  }, [surface]);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const bump = () => setTheme((n) => n + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    query?.addEventListener?.('change', bump);
    return () => {
      mo.disconnect();
      query?.removeEventListener?.('change', bump);
    };
  }, []);

  // The canvas is measured on its own box, which sits between the end arrows when choosing.
  const measured = choose ? (surface?.clientWidth ?? 0) || width : width;
  // While the peaks are read, a flat row of placeholder bars stands in, so the lane is the same height and the swell has bars to run over.
  const placeholder = !peaks && loading;
  const columns = useMemo(() => {
    if (measured <= 0) return null;
    if (!peaks) return loading ? placeholderColumns(barLayout(measured).count, scale) : null;
    // One column for each bar, so the window is reduced once per span and width, not once per frame.
    return peaksWindowAll(peaks, shownLayout.t0, shownLayout.t1, barLayout(measured).count);
  }, [peaks, loading, scale, shownLayout.t0, shownLayout.t1, measured]);
  const empty = placeholder ? false : peaks ? columns === null && measured > 0 : true;
  // The host's resolution, for the note on what a bar is at this zoom.
  const bps = peaks?.[0]?.peaks.bucketsPerSecond;

  // What the frame loop reads, so it keeps running while the host's playhead and the layout change under it.
  const latest = useRef({ layout: shownLayout, columns, width: measured, scale, placeholder });
  latest.current = { layout: shownLayout, columns, width: measured, scale, placeholder };
  const colors = useRef<RibbonColors | null>(null);
  // When the host last moved the playhead, for the loop to move it on from.
  const headStamp = useRef(0);
  useEffect(() => {
    headStamp.current = performance.now();
  }, [layout.playhead]);

  const paint = (frame: RibbonFrame): void => {
    const canvas = canvasRef.current;
    const { layout: l, columns: cols, width: w, scale: s, placeholder: stand } = latest.current;
    if (!canvas || !cols || w <= 0) return;
    colors.current ??= readRibbonColors(canvas);
    drawRibbon(canvas, { width: w, height: HEIGHT, dpr: window.devicePixelRatio || 1 }, l, cols, colors.current, frame, s, stand);
  };

  // The swell runs while the chapter plays, its crest on the playhead, and while the waveform is read, looping over the placeholder bars
  // (waveSwell.ts); the playhead moves on between host updates while it runs.
  const playing = shownLayout.playhead != null && columns !== null;
  const lastPhase = useRef<number | null>(null);
  const moving = (phase: number, nowMs: number): RibbonFrame => ({ nowMs, sinceUpdateMs: nowMs - headStamp.current, animate: true, swell: phase });
  const held = (phase: number | undefined): RibbonFrame => (phase == null ? STILL_FRAME : { ...STILL_FRAME, swell: phase });
  const swelling = useWaveSwell({
    active: playing || placeholder,
    target: surface ?? loadingBox,
    fixedPhase: swellPhase,
    motionKey: theme,
    onFrame: (phase, now) => {
      lastPhase.current = phase;
      paint(moving(phase, now));
    },
    onStill: () => {
      lastPhase.current = null;
      paint(held(swellPhase));
    },
  });

  // A draw whenever the data, the size or the look changes (the tokens are read again only then, not every frame). While the swell runs it is
  // drawn at its last phase, so the host's 4 Hz playhead updates do not flash the still look between frames.
  useEffect(() => {
    colors.current = null;
    paint(swelling ? moving(lastPhase.current ?? 0, performance.now()) : held(swellPhase));
  }, [columns, shownLayout, measured, theme, playing, scale, swelling, swellPhase]);

  // The waveform's own menu: a right click without a drag, a long touch, or the menu key while it has focus.
  const menuRef = useRef({ menu, ribbon, focus, t0: layout.t0, at: scroll.menuAt });
  menuRef.current = { menu, ribbon, focus, t0: layout.t0, at: scroll.menuAt };
  const provider = useMemo(
    () => ({
      match: (target: Element) => !!surface && surface.contains(target),
      items: (): ContextMenuItem[] => {
        const { menu: own, ribbon: r, focus: f, t0, at } = menuRef.current;
        const here = at();
        const viewItems: ContextMenuItem[] = [
          {
            key: 'zoom-in',
            label: here === null ? 'Zoom in' : `Zoom in at ${fineClock(t0 + here)}`,
            group: 'View',
            ...(r.canZoomIn ? {} : { unavailable: 'One second is the closest view.' }),
            onSelect: () => (here === null ? r.zoom(-1) : r.zoomAt(-1, here)),
          },
          {
            key: 'zoom-out',
            label: 'Zoom out',
            group: 'View',
            ...(r.canZoomOut ? {} : { unavailable: 'The whole recording is showing.' }),
            onSelect: () => r.zoom(1),
          },
          ...(f ? [{ key: 'show-line', label: 'Show the whole line', group: 'View', onSelect: () => r.show(f) }] : []),
          { key: 'show-all', label: 'Show the whole recording', group: 'View', onSelect: () => r.show({ start: 0, len: r.total }) },
        ];
        return [...(own ? own(here === null ? null : t0 + here) : []), ...viewItems];
      },
      tail: false,
    }),
    [surface],
  );
  useContextProvider(provider);

  const surfaceEvents = choose
    ? {
        onPointerDown: (e: PointerEvent) => {
          if (!scroll.onPointerDown(e)) interaction.surface.onPointerDown(e);
        },
        onPointerMove: (e: PointerEvent) => {
          if (!scroll.onPointerMove(e)) interaction.surface.onPointerMove(e);
        },
        onPointerUp: (e: PointerEvent) => {
          if (!scroll.onPointerUp(e)) interaction.surface.onPointerUp(e);
        },
        onPointerCancel: (e: PointerEvent) => {
          if (!scroll.onPointerUp(e)) interaction.surface.onPointerCancel(e);
        },
        onContextMenu: scroll.onContextMenu,
        onKeyDown: scroll.onKeyDown,
      }
    : {};

  const why = reason ?? 'This line lies outside the audio the host read.';
  const t0Shown = shownLayout.t0;
  const t1Shown = shownLayout.t1;
  const description = describe ? describe(t0Shown, t1Shown) : layout.description;
  const lane = placeholder ? (
    <div ref={setLoadingBox} className="relative min-w-0 flex-1" data-ribbon-loading>
      <canvas ref={canvasRef} role="img" aria-label="Reading the waveform" style={{ width: '100%', height: HEIGHT, display: 'block' }} />
    </div>
  ) : empty ? (
    <p className="m-0 flex min-w-0 flex-1 items-center px-3 text-xs text-[var(--text-muted)]" style={{ minHeight: HEIGHT }} data-ribbon-empty>
      No audio to draw. {why}
    </p>
  ) : (
    <div
      ref={setSurface}
      {...(choose
        ? {
            'data-ribbon-surface': '',
            role: 'group',
            tabIndex: 0,
            'aria-label': 'Waveform',
            'aria-describedby': helpId,
            'aria-keyshortcuts': 'ArrowLeft ArrowRight PageUp PageDown Home End + - Shift+F10',
          }
        : {})}
      {...surfaceEvents}
      className={`relative min-w-0 flex-1 ${choose ? 'cursor-crosshair touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]' : ''}`}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={choose ? 'Audio on screen' : 'Audio of the active line'}
        aria-describedby={descId}
        style={{ width: '100%', height: HEIGHT, display: 'block' }}
      />
      {choose ? <RangeOverlay interaction={interaction} t0={layout.t0} viewStart={view.start} viewLen={view.len} bounds={bounds} /> : null}
    </div>
  );

  if (!choose) {
    return (
      <div ref={boxRef} className="w-full bg-[var(--surface)] text-[var(--text)]" data-ribbon-pid={layout.pid}>
        {head ? (
          <div data-ribbon-head className="flex items-baseline gap-2 px-3 pt-1.5 text-xs text-[var(--text-muted)]">
            <span className="font-mono font-semibold text-[var(--text)]">{head.take ?? '—'}</span>
            <span>
              {head.take ? 'active take' : 'recording'} · {clock(layout.t0)} to {clock(layout.t1)}
            </span>
          </div>
        ) : null}
        {lane}
        <p id={descId} className="sr-only">
          {description}
        </p>
      </div>
    );
  }

  const headRow = head ? (
    <span data-ribbon-head className="flex flex-none items-baseline gap-1.5">
      <span className="font-mono font-semibold text-[var(--text)]">{head.take ?? 'Recording'}</span>
      {head.take ? <span>active take</span> : null}
    </span>
  ) : null;
  // Nothing to choose or zoom yet: the empty lane, or the placeholder bars while the peaks are read.
  const bare = empty || placeholder;
  const coarse = bps && !bare && measured / (view.len * bps) >= COARSE_PX;
  return (
    <div
      ref={boxRef}
      className="flex w-full flex-none flex-col overflow-hidden text-[var(--text)]"
      style={{ height: DOCK_HEIGHT }}
      data-ribbon-pid={layout.pid}
      data-wave-dock
    >
      {bare ? (
        <div className="flex h-8 flex-none items-center gap-1.5 px-3 text-xs text-[var(--text-muted)]">
          {headRow}
          {placeholder ? <span data-ribbon-reading>{why}</span> : null}
        </div>
      ) : (
        <ZoomRow t0={layout.t0} ribbon={ribbon} head={headRow} />
      )}
      <div className="flex min-h-0 items-stretch gap-1 px-2 py-1">
        <ScrollEnd dir={-1} ribbon={ribbon} />
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">{lane}</div>
        <ScrollEnd dir={1} ribbon={ribbon} />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" data-ribbon-notes>
        {bare ? null : coarse ? (
          <p data-peaks-detail className="m-0 px-3 text-xs text-[var(--text-muted)]">
            Each bar is {Math.round(1000 / bps)} ms of audio at this zoom: the host keeps {bps} peaks a second.
          </p>
        ) : null}
        {bare ? null : <RangeNotes shown={interaction.shown} covered={interaction.covered} words={choose.words} />}
      </div>
      <p role="status" className="sr-only">
        {interaction.announcement}
      </p>
      <p id={helpId} className="sr-only">
        Drag to choose a range. Right-drag, the wheel or two fingers scroll the audio; on the focused waveform the arrow keys scroll it, Shift or Page Up and
        Page Down a whole window, Home and End to either end, plus and minus zoom, and the menu key or Shift+F10 opens its menu.
      </p>
      <p id={descId} className="sr-only">
        {description}
      </p>
    </div>
  );
}
