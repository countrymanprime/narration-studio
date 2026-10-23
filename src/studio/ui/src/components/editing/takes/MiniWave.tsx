import { useMemo } from 'react';

/** A drawing of the take's level; the same take always draws the same bars. Decoration: the figures beside it say what was measured. */
export function MiniWave({ id, seconds }: { id: string; seconds: number }) {
  const bars = useMemo(() => {
    const n = Math.max(10, Math.min(48, Math.round(seconds * 2.4)));
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: n }, (_, i) => {
      const r = ((((h + i * 977) * 2654435761) >>> 0) % 1000) / 1000;
      return 3 + (0.35 + 0.65 * Math.abs(Math.sin(i / 3 + (h % 7)))) * (0.4 + r) * 9;
    });
  }, [id, seconds]);
  return (
    <svg className="mini block h-5 w-full min-w-0 text-[var(--text-muted)]" viewBox={`0 0 ${bars.length * 3} 20`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b, i) => (
        <rect key={i} x={i * 3} y={10 - b / 2} width={2} height={b} rx={1} fill="currentColor" />
      ))}
    </svg>
  );
}
