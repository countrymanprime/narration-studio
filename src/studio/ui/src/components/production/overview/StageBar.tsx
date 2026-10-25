import { statusTone, type StatusId } from '../../../kinds/statusTone';
import { Panel } from '../../primitives/Panel';
import { toneColors } from '../../primitives/StatusBadge';
import { hm } from '../../schedule/dates';
import { num } from '../../schedule/dates';
import type { StageSegment } from './overviewFigures';

// A bar needs one fill per stage: the registry's tone for the stage's status, lightened for the stage before it (the legend carries the names).
// Lightened toward white in both themes: toward --surface, the dark theme darkened them instead and the order of the tones flipped (XPR2-45).
const line = (id: StatusId) => toneColors(statusTone(id)).line;
const FILL: Record<StageSegment['key'], string> = {
  delivered: line('done'),
  proofed: `color-mix(in srgb, ${line('done')} 70%, white)`,
  edited: line('in_progress'),
  recorded: `color-mix(in srgb, ${line('in_progress')} 55%, white)`,
  unrecorded: 'var(--line-strong)',
};

/** "Where the book stands": the finished hours at each stage as one bar with a legend. */
export function StageBar({ segments, wph }: { segments: readonly StageSegment[]; wph: number }) {
  return (
    // `fill`: the card takes its row's height and the legend band sits on its foot, never above a white strip (XPR2-7).
    <Panel title="Where the book stands" className="min-w-0" flush fill>
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col justify-center px-4 py-3.5">
          <div
            role="img"
            aria-label="Book progress by stage"
            className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--border)]"
            title={`By finished audio, at each stage. Estimated at ${num(wph)} words per finished hour.`}
          >
            {/* A stage with nothing in it draws no segment: a zero-width one still painted a sliver at the bar's end (R3PR2-13). The legend keeps it. */}
            {segments
              .filter((s) => s.hours > 0)
              .map((s) => (
                <i
                  key={s.key}
                  title={`${s.label}: ${hm(s.hours)}`}
                  className="block h-full min-w-1"
                  style={{ width: `${s.percent.toFixed(2)}%`, background: FILL[s.key] }}
                />
              ))}
          </div>
        </div>
        {/* A grid by the card's own width, never one entry alone on a row: five across, else three and two, else two a row with the last
          across both (R3PR1-2). */}
        <div className="@container border-t border-[var(--border)] bg-[var(--surface-2)]">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-2.5 text-[0.8125rem] text-[var(--text-muted)] @min-[27rem]:grid-cols-3 @min-[44rem]:grid-cols-5 [&>:last-child:nth-child(odd)]:col-span-2 @min-[27rem]:[&>:last-child:nth-child(odd)]:col-span-1">
            {segments.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: FILL[s.key] }} />
                {s.label} <b className="font-mono font-semibold text-[var(--text)]">{hm(s.hours)}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
