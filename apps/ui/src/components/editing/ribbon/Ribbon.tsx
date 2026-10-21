import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import type { TimeWindow } from '../../proof/frame/windowMath';
import type { ChapterDoc, DocItem } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import { reducedMotion } from '../../../motion';
import { drawRibbon, readRibbonColors, STILL_FRAME, type RibbonColors, type RibbonFrame } from './drawRibbon';
import { subscribeFrames } from './frameLoop';
import { peakGain, peaksWindowAll } from './peaksWindow';
import { barLayout } from './ribbonBars';
import { activePid, ribbonLayout, type RibbonLayout } from './ribbonLayout';
import { pickEntries, useRibbonPeaks } from './useRibbonPeaks';
import { RangeNotes, RangeOverlay } from './RangeOverlay';
import { spanOfKeys, wordAtTime, wordsCovered, type Span } from './rangeMath';
import { PanStrip, ZoomRow } from './RibbonControls';
import { useRangeInteraction } from './useRangeInteraction';
import { useRibbonView } from './useRibbonView';

const HEIGHT = 56;
/** Width used where nothing can measure the canvas (a test environment without ResizeObserver). */
const FALLBACK_WIDTH = 640;

const clock = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** A peak bar wider than this many pixels is a block of audio, not a detail of it, and the waveform says so. */
const COARSE_PX = 10;

/** What makes the waveform a place to choose a range: the line's words, the range now, and what to do when it changes or is tapped. Without it the ribbon only shows. */
export interface RibbonRange {
  words: readonly DocItem[];
  range: Span | null;
  onRange: (span: Span, phase: 'drag' | 'commit') => void;
  /** A tap on the waveform (no drag) at a time on the document's clock. */
  onTap: (t: number) => void;
}

/**
 * The ribbon for one line: the audio of its window with word ticks, tints, the selection band and the playhead. With no peaks it draws nothing and says why.
 * Given `choose` it is also the place to zoom (down to one second) and pan, and to draw a range with a handle on each edge: `initialView` is the part it opens on.
 */
export function RibbonView({
  layout,
  peaks,
  reason,
  head,
  choose,
  initialView,
  gain = 1,
}: {
  layout: RibbonLayout;
  /** The audio the line covers: one entry, or every item it runs across. */
  peaks?: WorkspacePeaks | readonly WorkspacePeaks[];
  reason?: string;
  /** The header row above the waveform: the active take's name (null for a line heard in the recording) and the span it draws. Omitted, no row. */
  head?: { take: string | null };
  choose?: RibbonRange;
  /** The part of the line to open on, seconds from its start; the whole line when left out. */
  initialView?: TimeWindow;
  /** How much the bars are scaled up for display (`peakGain`); 1 draws the raw level. */
  gain?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  // Bumped when the root's `data-theme` or `data-motion` changes, or the system's motion setting does, so the draw re-reads the tokens and the motion choice.
  const [theme, setTheme] = useState(0);
  const descId = useId();
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const total = layout.t1 - layout.t0;
  const ribbon = useRibbonView(total, layout.playhead == null ? null : layout.playhead - layout.t0, surface, initialView);
  const view = choose ? ribbon.view : { start: 0, len: total };
  // What is drawn is the view; the layout's words, tints and cuts are on the document's clock and need no change.
  const shownLayout = useMemo(
    () => (choose ? { ...layout, t0: layout.t0 + view.start, t1: layout.t0 + view.start + view.len } : layout),
    [choose, layout, view.start, view.len],
  );
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
  }, []);
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

  const columns = useMemo(() => {
    if (!peaks || width <= 0) return null;
    // One column for each bar, so the window is reduced once per span and width, not once per frame.
    return peaksWindowAll(Array.isArray(peaks) ? peaks : [peaks as WorkspacePeaks], shownLayout.t0, shownLayout.t1, barLayout(width).count);
  }, [peaks, shownLayout.t0, shownLayout.t1, width]);
  const empty = peaks ? columns === null && width > 0 : true;
  // The host's resolution, for the note on what a bar is at this zoom.
  const bps = (Array.isArray(peaks) ? peaks[0] : peaks)?.bucketsPerSecond;

  // What the frame loop reads, so it keeps running while the host's playhead and the layout change under it.
  const latest = useRef({ layout: shownLayout, columns, width, gain });
  latest.current = { layout: shownLayout, columns, width, gain };
  const colors = useRef<RibbonColors | null>(null);
  // When the host last moved the playhead, for the loop to move it on from.
  const headStamp = useRef(0);
  useEffect(() => {
    headStamp.current = performance.now();
  }, [layout.playhead]);

  const paint = (frame: RibbonFrame): void => {
    const canvas = canvasRef.current;
    const { layout: l, columns: cols, width: w, gain: g } = latest.current;
    if (!canvas || !cols || w <= 0) return;
    colors.current ??= readRibbonColors(canvas);
    drawRibbon(canvas, { width: w, height: HEIGHT, dpr: window.devicePixelRatio || 1 }, l, cols, colors.current, frame, g);
  };

  const playing = layout.playhead != null && columns !== null;
  const frameNow = (): RibbonFrame => ({ nowMs: performance.now(), sinceUpdateMs: performance.now() - headStamp.current, animate: true });

  // A draw whenever the data, the size or the look changes (the tokens are read again only then, not every frame). While the loop below is
  // running it is drawn in motion, so the host's 4 Hz playhead updates do not flash the still look between frames.
  useEffect(() => {
    colors.current = null;
    paint(playing && !reducedMotion() ? frameNow() : STILL_FRAME);
  }, [columns, shownLayout, width, theme, playing, gain]);

  // One shared frame loop, only while this line is playing and motion is wanted; stopping or reducing motion draws the still look once.
  useEffect(() => {
    if (!playing || reducedMotion()) return;
    const stop = subscribeFrames((now) => paint({ ...frameNow(), nowMs: now }));
    return () => {
      stop();
      paint(STILL_FRAME);
    };
  }, [playing, theme, width, gain]);

  const why = reason ?? 'This line lies outside the audio the host read.';
  return (
    <div ref={boxRef} className="my-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]" data-ribbon-pid={layout.pid}>
      {head ? (
        <div data-ribbon-head className="flex items-baseline gap-2 px-3 pt-1.5 text-xs text-[var(--text-muted)]">
          <span className="font-mono font-semibold text-[var(--text)]">{head.take ?? '—'}</span>
          <span>
            {head.take ? 'active take' : 'recording'} · {clock(layout.t0)} to {clock(layout.t1)}
          </span>
        </div>
      ) : null}
      {choose && !empty ? <ZoomRow t0={layout.t0} ribbon={ribbon} /> : null}
      {empty ? (
        <p className="m-0 px-3 py-2 text-xs text-[var(--text-muted)]" style={{ minHeight: HEIGHT }}>
          No audio to draw. {why}
        </p>
      ) : (
        <div
          ref={setSurface}
          {...(choose ? { 'data-ribbon-surface': '', ...interaction.surface } : {})}
          className={`relative ${choose ? 'cursor-crosshair touch-none select-none' : ''}`}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Audio of the active line"
            aria-describedby={descId}
            style={{ width: '100%', height: HEIGHT, display: 'block' }}
          />
          {choose ? <RangeOverlay interaction={interaction} t0={layout.t0} viewStart={view.start} viewLen={view.len} bounds={bounds} /> : null}
        </div>
      )}
      {choose && !empty && ribbon.zoomed ? <PanStrip t0={layout.t0} ribbon={ribbon} /> : null}
      {choose && bps && !empty && width / (view.len * bps) >= COARSE_PX ? (
        <p data-peaks-detail className="m-0 px-3 pb-1 text-xs text-[var(--text-muted)]">
          Each bar is {Math.round(1000 / bps)} ms of audio at this zoom: the host keeps {bps} peaks a second.
        </p>
      ) : null}
      {choose && !empty ? <RangeNotes shown={interaction.shown} covered={interaction.covered} words={choose.words} /> : null}
      {choose ? (
        <p role="status" className="sr-only">
          {interaction.announcement}
        </p>
      ) : null}
      <p id={descId} className="sr-only">
        {layout.description}
      </p>
    </div>
  );
}

/** The ribbon under the active line: renders for the cursor's paragraph, else the selection head's, else the playing word's, and for no other. */
/** `take` is the line's active take, named in the header; a line with none is heard in the recording. */
export function Ribbon({ chapterId, pid, take = null, items }: { chapterId: string; pid: string; take?: string | null; items?: readonly number[] }) {
  const { doc, state, selected } = useEditingPage();
  if (activePid(doc, state) !== pid) return null;
  return <ActiveRibbon chapterId={chapterId} doc={doc} pid={pid} selected={selected} playT={state.playT} take={take} items={items} />;
}

function ActiveRibbon({
  chapterId,
  doc,
  pid,
  selected,
  playT,
  take,
  items,
}: {
  chapterId: string;
  doc: ChapterDoc;
  pid: string;
  selected: string[];
  playT: number | null;
  take: string | null;
  items: readonly number[] | undefined;
}) {
  const { state, dispatch } = useEditingPage();
  const peaks = useRibbonPeaks(chapterId);
  const layout = useMemo(() => ribbonLayout(doc, pid, selected, playT), [doc, pid, selected, playT]);
  const words = useMemo(() => doc.paras.find((p) => p.p.id === pid)?.items ?? [], [doc, pid]);
  // The range is what the narrator drew, else the span of the words that are selected.
  const range = useMemo(() => state.span ?? spanOfKeys(words, selected), [state.span, words, selected]);
  // While a drag runs the page follows only when the words it covers change, so the script is not redrawn at every pixel.
  const lastKeys = useRef('');
  const onRange = useCallback(
    (span: Span, phase: 'drag' | 'commit') => {
      const { keys } = wordsCovered(words, span);
      const anchor = keys[0] ?? null;
      const head = keys[keys.length - 1] ?? null;
      const id = `${anchor}|${head}`;
      if (phase === 'drag') {
        if (id === lastKeys.current) return;
        lastKeys.current = id;
      } else lastKeys.current = '';
      dispatch({ type: 'selectSpan', span, anchor, head });
    },
    [words, dispatch],
  );
  // A tap puts the cursor on the word it lands on, and on no word lets the range go.
  const onTap = useCallback(
    (t: number) => {
      const word = wordAtTime(words, t);
      dispatch(word ? { type: 'place', key: word.key } : { type: 'dropRange' });
    },
    [words, dispatch],
  );
  const choose = useMemo(() => ({ words, range, onRange, onTap }), [words, range, onRange, onTap]);
  if (!layout) return null;
  const entry = pickEntries(peaks, layout.t0, layout.t1, items);
  return (
    <RibbonView
      layout={layout}
      head={{ take }}
      choose={choose}
      gain={peakGain(peaks)}
      {...('peaks' in entry ? { peaks: entry.peaks } : { reason: entry.reason })}
    />
  );
}
