import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import type { ChapterDoc } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import { reducedMotion } from '../../../motion';
import { drawRibbon, readRibbonColors, STILL_FRAME, type RibbonColors, type RibbonFrame } from './drawRibbon';
import { subscribeFrames } from './frameLoop';
import { peaksWindow } from './peaksWindow';
import { barLayout } from './ribbonBars';
import { activePid, ribbonLayout, type RibbonLayout } from './ribbonLayout';
import { pickEntry, useRibbonPeaks } from './useRibbonPeaks';

const HEIGHT = 56;
/** Width used where nothing can measure the canvas (a test environment without ResizeObserver). */
const FALLBACK_WIDTH = 640;

const clock = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** The ribbon for one line: the audio of its window with word ticks, tints, the selection band and the playhead. With no peaks it draws nothing and says why. */
export function RibbonView({
  layout,
  peaks,
  reason,
  head,
}: {
  layout: RibbonLayout;
  peaks?: WorkspacePeaks;
  reason?: string;
  /** The header row above the waveform: the active take's name (null for a line heard in the recording) and the span it draws. Omitted, no row. */
  head?: { take: string | null };
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  // Bumped when the root's `data-theme` or `data-motion` changes, or the system's motion setting does, so the draw re-reads the tokens and the motion choice.
  const [theme, setTheme] = useState(0);
  const descId = useId();

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
    return peaksWindow(peaks, layout.t0, layout.t1, barLayout(width).count);
  }, [peaks, layout.t0, layout.t1, width]);
  const empty = peaks ? columns === null && width > 0 : true;

  // What the frame loop reads, so it keeps running while the host's playhead and the layout change under it.
  const latest = useRef({ layout, columns, width });
  latest.current = { layout, columns, width };
  const colors = useRef<RibbonColors | null>(null);
  // When the host last moved the playhead, for the loop to move it on from.
  const headStamp = useRef(0);
  useEffect(() => {
    headStamp.current = performance.now();
  }, [layout.playhead]);

  const paint = (frame: RibbonFrame): void => {
    const canvas = canvasRef.current;
    const { layout: l, columns: cols, width: w } = latest.current;
    if (!canvas || !cols || w <= 0) return;
    colors.current ??= readRibbonColors(canvas);
    drawRibbon(canvas, { width: w, height: HEIGHT, dpr: window.devicePixelRatio || 1 }, l, cols, colors.current, frame);
  };

  const playing = layout.playhead != null && columns !== null;
  const frameNow = (): RibbonFrame => ({ nowMs: performance.now(), sinceUpdateMs: performance.now() - headStamp.current, animate: true });

  // A draw whenever the data, the size or the look changes (the tokens are read again only then, not every frame). While the loop below is
  // running it is drawn in motion, so the host's 4 Hz playhead updates do not flash the still look between frames.
  useEffect(() => {
    colors.current = null;
    paint(playing && !reducedMotion() ? frameNow() : STILL_FRAME);
  }, [columns, layout, width, theme, playing]);

  // One shared frame loop, only while this line is playing and motion is wanted; stopping or reducing motion draws the still look once.
  useEffect(() => {
    if (!playing || reducedMotion()) return;
    const stop = subscribeFrames((now) => paint({ ...frameNow(), nowMs: now }));
    return () => {
      stop();
      paint(STILL_FRAME);
    };
  }, [playing, theme, width]);

  const why = reason ?? 'This line lies outside the audio the host read.';
  return (
    <div ref={boxRef} className="my-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]" data-ribbon-pid={layout.pid}>
      {head ? (
        <div data-ribbon-head className="flex items-baseline gap-2 px-3 pt-1.5 text-xs text-[var(--text-muted)]">
          <span className="font-mono font-semibold text-[var(--text)]">{head.take ?? '—'}</span>
          <span>
            {head.take ? 'active take' : 'recording'} · {clock(layout.t0)} to {clock(layout.t1)}
          </span>
        </div>
      ) : null}
      {empty ? (
        <p className="m-0 px-3 py-2 text-xs text-[var(--text-muted)]" style={{ minHeight: HEIGHT }}>
          No audio to draw. {why}
        </p>
      ) : (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Audio of the active line"
          aria-describedby={descId}
          style={{ width: '100%', height: HEIGHT, display: 'block' }}
        />
      )}
      <p id={descId} className="sr-only">
        {layout.description}
      </p>
    </div>
  );
}

/** The ribbon under the active line: renders for the cursor's paragraph, else the selection head's, else the playing word's, and for no other. */
/** `take` is the line's active take, named in the header; a line with none is heard in the recording. */
export function Ribbon({ chapterId, pid, take = null }: { chapterId: string; pid: string; take?: string | null }) {
  const { doc, state, selected } = useEditingPage();
  if (activePid(doc, state) !== pid) return null;
  return <ActiveRibbon chapterId={chapterId} doc={doc} pid={pid} selected={selected} playT={state.playT} take={take} />;
}

function ActiveRibbon({
  chapterId,
  doc,
  pid,
  selected,
  playT,
  take,
}: {
  chapterId: string;
  doc: ChapterDoc;
  pid: string;
  selected: string[];
  playT: number | null;
  take: string | null;
}) {
  const peaks = useRibbonPeaks(chapterId);
  const layout = useMemo(() => ribbonLayout(doc, pid, selected, playT), [doc, pid, selected, playT]);
  if (!layout) return null;
  const entry = pickEntry(peaks, layout.t0, layout.t1);
  return <RibbonView layout={layout} head={{ take }} {...('peaks' in entry ? { peaks: entry.peaks } : { reason: entry.reason })} />;
}
