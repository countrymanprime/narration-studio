import { useEffect, useId, useRef, useState } from 'react';
import { Panel } from '../../primitives/Panel';
import type { Measured } from '../../../api/schemas/base';
import { addDays, diffDays, fmtD } from '../../schedule/dates';
import type { Calc } from '../../schedule/progress';
import { NOT_MEASURED } from '../measured/measured.selectors';

const MIN_WIDTH = 280;
const DAY = 86_400_000;
const PAD = { left: 40, right: 12, top: 14, bottom: 28 };
const MONO = 'IBM Plex Mono, monospace';

type Props = {
  k: Calc;
  /** Words per finished hour of the chosen basis. */
  wph: number;
  /** The plan's first day, today and the due date (null until one is set). */
  start: Date;
  today: Date;
  due: Date | null;
  /** The finished hours recorded so far (the measured total). */
  recordedHours: number;
  /** Cumulative finished hours at the end of each recorded day, in days from `start`; the reason when there is no take log. */
  series: Measured<Array<[number, number]>>;
  /** The fixed height in px; the chart draws to the width it is given. */
  height?: number;
};

/** "Recorded vs plan": the plan dashed, the recorded days solid, the projection dotted, with the due line, today and the estimated finish. */
export function ProgressChart({ k, wph, start, today, due, recordedHours, series, height = 200 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const describedBy = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = (): void => setWidth(Math.max(MIN_WIDTH, Math.round(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const finishedHours = k.words / wph;
  const lastDay = new Date(Math.max(due?.getTime() ?? 0, k.finish.getTime()) + 3 * DAY);
  const span = Math.max(1, diffDays(lastDay, start));
  const yMax = Math.max(1, Math.ceil(finishedHours * 1.1));
  const x = (d: Date): number => PAD.left + (diffDays(d, start) / span) * (width - PAD.left - PAD.right);
  const y = (v: number): number => height - PAD.bottom - (v / yMax) * (height - PAD.bottom - PAD.top);
  const nowDay = diffDays(today, start);
  const actual: Array<[number, number]> = series.ok ? [...series.value.filter((p) => p[0] < nowDay), [nowDay, recordedHours]] : [];
  const weeks: number[] = [];
  for (let d = 0; d <= span; d += 7) weeks.push(d);
  const rows = Array.from({ length: yMax + 1 }, (_, v) => v).slice(0, 4);
  const summary = `Plan starts ${fmtD(start)}${due ? `, due ${fmtD(due)}` : ', no due date'}. Today is ${fmtD(today)}, ${recordedHours.toFixed(1)} of ${finishedHours.toFixed(1)} finished hours recorded. Estimated finish ${fmtD(k.finish)}.`;

  return (
    <Panel title="Recorded vs plan" className="min-w-0">
      <div ref={box} className="w-full overflow-hidden" style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="block"
          role="img"
          aria-label="Recorded audio versus plan"
          aria-describedby={describedBy}
        >
          {rows.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)" fontFamily={MONO}>{`${v}h`}</text>
            </g>
          ))}
          {weeks.map((d) => (
            <text key={d} x={x(addDays(start, d))} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--text-muted)" fontFamily={MONO}>
              {fmtD(addDays(start, d))}
            </text>
          ))}
          {due && (
            <>
              <line x1={x(due)} x2={x(due)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--danger)" strokeDasharray="2 4" data-line="due" />
              <text x={x(due) - 4} y={PAD.top + 10} textAnchor="end" fontSize="11" fill="var(--danger-text)">{`due ${fmtD(due)}`}</text>
              <line
                x1={x(start)}
                y1={y(0)}
                x2={x(due)}
                y2={y(finishedHours)}
                stroke="var(--text-muted)"
                strokeWidth="2"
                strokeDasharray="6 5"
                data-line="plan"
              />
            </>
          )}
          {actual.length > 0 && (
            <polyline
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              data-line="actual"
              points={actual.map((p) => `${x(addDays(start, p[0]))},${y(p[1])}`).join(' ')}
            />
          )}
          {!series.ok && <text x={PAD.left + 8} y={PAD.top + 10} fontSize="11" fill="var(--text-muted)">{`Recorded days ${NOT_MEASURED}`}</text>}
          <line
            x1={x(today)}
            y1={y(recordedHours)}
            x2={x(k.finish)}
            y2={y(finishedHours)}
            stroke="var(--accent)"
            strokeWidth="2"
            strokeDasharray="1 5"
            strokeLinecap="round"
            data-line="projection"
          />
          <circle cx={x(today)} cy={y(recordedHours)} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" data-marker="today" />
          <text x={x(today)} y={y(recordedHours) - 10} textAnchor="middle" fontSize="11" fill="var(--text)">
            today
          </text>
          <text x={x(k.finish)} y={y(finishedHours) - 8} textAnchor="end" fontSize="11" fill="var(--text)">{`done ${fmtD(k.finish)} (est.)`}</text>
        </svg>
      </div>
      <p id={describedBy} className="sr-only">
        {summary}
      </p>
    </Panel>
  );
}
