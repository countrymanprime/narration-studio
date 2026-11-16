import { Panel } from '../../primitives/Panel';
import { ProgressBar } from '../../primitives/ProgressBar';
import { hm } from '../../schedule/dates';
import type { WeekFigures } from '../measured/measured.selectors';
import { NOT_MEASURED } from './overviewFigures';

const HOUR = 3600;
const MONO = 'font-mono';

/** "This week": the week's finished hours against the plan's weekly target, and the last 24 hours as the voice-rest reading. */
export function WeekCard({ figures }: { figures: WeekFigures }) {
  const { week, target, last24h } = figures;
  const share = week.ok && target ? Math.min(100, (week.value / target) * 100) : null;
  return (
    <Panel title="This week" className="min-w-0">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 text-[0.875rem]">
          <span>Recorded this week</span>
          <span className={MONO} data-week>
            {week.ok ? hm(week.value / HOUR) + (target != null ? ` / ${hm(target / HOUR)}` : '') : NOT_MEASURED}
          </span>
        </div>
        {share !== null && <ProgressBar label="Recorded this week" value={Math.round(share)} size="thin" />}
        <div className="flex items-baseline justify-between gap-3 text-[0.875rem]">
          <span>Voice rest (last 24 h)</span>
          <span className={MONO} data-rest>
            {last24h.ok ? `${hm(last24h.value / HOUR)} recorded` : NOT_MEASURED}
          </span>
        </div>
      </div>
    </Panel>
  );
}
