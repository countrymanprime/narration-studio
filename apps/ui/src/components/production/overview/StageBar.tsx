import { Panel } from '../../primitives/Panel';
import { hm } from '../../schedule/dates';
import { num } from '../../schedule/dates';
import type { StageSegment } from './overviewFigures';

// Delivered has no chapter-level source, so it is not drawn (ADR 0015).
const FILL: Record<StageSegment['key'], string> = {
  proofed: 'color-mix(in srgb, var(--ok) 70%, var(--surface))',
  edited: 'var(--info)',
  recorded: 'var(--accent)',
  unrecorded: 'var(--line-strong)',
};

/** "Where the book stands": the finished hours at each stage as one bar with a legend. */
export function StageBar({ segments, wph }: { segments: readonly StageSegment[]; wph: number }) {
  return (
    <Panel title="Where the book stands" className="min-w-0">
      <div
        role="img"
        aria-label="Book progress by stage"
        className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
        title={`By finished audio, at each stage. Estimated at ${num(wph)} words per finished hour.`}
      >
        {segments.map((s) => (
          <i key={s.key} title={`${s.label}: ${hm(s.hours)}`} style={{ width: `${s.percent.toFixed(2)}%`, background: FILL[s.key] }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-[var(--text-muted)]">
        {segments.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: FILL[s.key] }} />
            {s.label} <b className="font-mono font-semibold text-[var(--text)]">{hm(s.hours)}</b>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
