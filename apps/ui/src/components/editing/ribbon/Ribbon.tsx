import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import type { ChapterDoc } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import { drawRibbon, readRibbonColors } from './drawRibbon';
import { peaksWindow } from './peaksWindow';
import { activePid, ribbonLayout, type RibbonLayout } from './ribbonLayout';
import { pickEntry, useRibbonPeaks } from './useRibbonPeaks';

const HEIGHT = 56;
/** Width used where nothing can measure the canvas (a test environment without ResizeObserver). */
const FALLBACK_WIDTH = 640;

/** The ribbon for one line: the audio of its window with word ticks, tints, the selection band and the playhead. With no peaks it draws nothing and says why. */
export function RibbonView({ layout, peaks, reason }: { layout: RibbonLayout; peaks?: WorkspacePeaks; reason?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  // Bumped when the root's `data-theme` changes, so the draw re-reads the tokens.
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
    const mo = new MutationObserver(() => setTheme((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  const columns = useMemo(() => {
    if (!peaks || width <= 0) return null;
    return peaksWindow(peaks, layout.t0, layout.t1, Math.max(1, Math.round(width)));
  }, [peaks, layout.t0, layout.t1, width]);
  const empty = peaks ? columns === null && width > 0 : true;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !columns || width <= 0) return;
    drawRibbon(canvas, { width, height: HEIGHT, dpr: window.devicePixelRatio || 1 }, layout, columns, readRibbonColors(canvas));
  }, [columns, layout, width, theme]);

  const why = reason ?? 'This line lies outside the audio the host read.';
  return (
    <div ref={boxRef} className="my-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]" data-ribbon-pid={layout.pid}>
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
export function Ribbon({ chapterId, pid }: { chapterId: string; pid: string }) {
  const { doc, state, selected } = useEditingPage();
  if (activePid(doc, state) !== pid) return null;
  return <ActiveRibbon chapterId={chapterId} doc={doc} pid={pid} selected={selected} playT={state.playT} />;
}

function ActiveRibbon({ chapterId, doc, pid, selected, playT }: { chapterId: string; doc: ChapterDoc; pid: string; selected: string[]; playT: number | null }) {
  const peaks = useRibbonPeaks(chapterId);
  const layout = useMemo(() => ribbonLayout(doc, pid, selected, playT), [doc, pid, selected, playT]);
  if (!layout) return null;
  const entry = pickEntry(peaks, layout.t0, layout.t1);
  return <RibbonView layout={layout} {...('peaks' in entry ? { peaks: entry.peaks } : { reason: entry.reason })} />;
}
