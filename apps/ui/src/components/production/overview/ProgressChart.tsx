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
/** The least room, in px, between two date labels on the axis. */
const TICK_GAP = 72;

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
  /** Fill the card's height (the Schedule's chart stretches beside the Contract and the work left); `height` is then the least it takes. */
  fill?: boolean;
  /** The panel's title: Production says "Recorded vs plan", the Schedule page "Recorded audio vs plan" (the mock). */
  title?: string;
};

/** "Recorded vs plan": the plan dashed, the recorded days solid, the projection dotted, with the due line, today and the estimated finish. */
export function ProgressChart({ k, wph, start, today, due, recordedHours, series, height: minHeight = 200, fill = false, title = 'Recorded vs plan' }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const [boxHeight, setBoxHeight] = useState(minHeight);
  const height = fill ? Math.max(minHeight, boxHeight) : minHeight;
  const describedBy = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = (): void => {
      setWidth(Math.max(MIN_WIDTH, Math.round(el.clientWidth)));
      setBoxHeight(Math.round(el.clientHeight));
    };
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
  // A week apart, or wider when the labels would touch (a narrow card) or the plan runs for years: a due date far away must not draw a tick for every week of it.
  const pxPerDay = (width - PAD.left - PAD.right) / span;
  const step = Math.max(7, Math.ceil(TICK_GAP / pxPerDay / 7) * 7);
  for (let d = 0; d <= span; d += step) weeks.push(d);
  const planDays = due ? diffDays(due, start) : 0;
  const aheadOfPlan = planDays > 0 && y(recordedHours) < y((finishedHours * nowDay) / planDays);
  const todayBelow = !aheadOfPlan || x(today) < PAD.left + 40;
  const rows = Array.from({ length: yMax + 1 }, (_, v) => v).slice(0, 4);
  const summary = `Plan starts ${fmtD(start)}${due ? `, due ${fmtD(due)}` : ', no due date'}. Today is ${fmtD(today)}, ${recordedHours.toFixed(1)} of ${finishedHours.toFixed(1)} finished hours recorded. Estimated finish ${fmtD(k.finish)}.`;

  return (
    <Panel title={title} className="min-w-0" fill={fill}>
      {/* Filling, the svg is laid over the box so what it draws never sets the card's height: the cell does. */}
      <div ref={box} className={fill ? 'relative size-full overflow-hidden' : 'w-full overflow-hidden'} style={fill ? { minHeight } : { height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className={fill ? 'absolute inset-0 block' : 'block'}
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
              <text
                x={x(due) + (x(due) < 96 ? 4 : -4)}
                y={PAD.top + 10}
                textAnchor={x(due) < 96 ? 'start' : 'end'}
                fontSize="11"
                fill="var(--danger-text)"
              >{`due ${fmtD(due)}`}</text>
              {/* A due date on or before the plan's first day leaves no plan to draw. */}
              {diffDays(due, start) > 0 && (
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
              )}
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
          {/* Mid-height at the left, clear of the "done" label at the top right and the "today" marker at the bottom. */}
          {!series.ok && <text x={PAD.left + 8} y={(PAD.top + y(0)) / 2} fontSize="11" fill="var(--text-muted)">{`Recorded days ${NOT_MEASURED}`}</text>}
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
          {/* Beside the dot, on the side the plan line is not: above and left when the recording is ahead of the plan (the plan passes below), below and right otherwise. The projection runs up and right from the dot, so the right side is only taken below it. */}
          <text
            x={todayBelow ? x(today) + 9 : x(today) - 7}
            y={y(recordedHours) + (todayBelow ? 18 : -14)}
            textAnchor={todayBelow ? 'start' : 'end'}
            fontSize="11"
            fill="var(--text)"
          >
            today
          </text>
          <text
            x={x(k.finish)}
            y={y(finishedHours) - 8}
            textAnchor={x(k.finish) < 130 ? 'start' : 'end'}
            fontSize="11"
            fill="var(--text)"
          >{`done ${fmtD(k.finish)} (est.)`}</text>
        </svg>
      </div>
      <p id={describedBy} className="sr-only">
        {summary}
      </p>
    </Panel>
  );
}
