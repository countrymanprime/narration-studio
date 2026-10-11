import { useEffect, useMemo, useRef, useState } from 'react';
import { barsFor, type PeaksSegment } from './peaksJoin';

/**
 * The peaks of `from`..`to` seconds as one bar per pixel column, symmetric about the centreline: played (before `playhead`) in `--accent`,
 * the rest in `--waveform`, both read from the computed style and read again when the root's `data-theme` changes. An item with no peaks
 * draws a flat muted line, never a gap. Decorative (`aria-hidden`): the caller names the waveform.
 */
export function PeaksCanvas({
  segments,
  from,
  to,
  height,
  playhead = null,
}: {
  segments: readonly PeaksSegment[];
  from: number;
  to: number;
  height: number;
  playhead?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setThemeVersion((version) => version + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    // jsdom has no ResizeObserver: the canvas stays unsized there and draws nothing; the visual suite always has one.
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0]?.contentRect.width ?? 0)));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const bars = useMemo(() => barsFor(segments, from, to, width), [segments, from, to, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(canvas);
    // A token that reads empty falls back to the canvas's own text colour, never a literal.
    const played = styles.getPropertyValue('--accent').trim() || styles.color;
    const rest = styles.getPropertyValue('--waveform').trim() || styles.color;
    const centre = height / 2;
    const playheadX = playhead == null || to <= from ? -1 : ((playhead - from) / (to - from)) * width;
    for (const bar of bars) {
      ctx.strokeStyle = bar.x <= playheadX ? played : rest;
      ctx.beginPath();
      if (bar.flat) {
        ctx.moveTo(bar.x + 0.5, centre - 0.5);
        ctx.lineTo(bar.x + 0.5, centre + 0.5);
      } else {
        ctx.moveTo(bar.x + 0.5, centre - bar.high * centre);
        ctx.lineTo(bar.x + 0.5, centre - bar.low * centre);
      }
      ctx.stroke();
    }
  }, [bars, width, height, playhead, from, to, themeVersion]);

  return (
    <div ref={containerRef} aria-hidden="true">
      <canvas ref={canvasRef} data-peaks-canvas style={{ width: '100%', height, display: 'block' }} />
    </div>
  );
}
