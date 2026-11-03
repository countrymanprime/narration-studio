import { useEffect, useId, useRef, useState } from 'react';
import { HelpButton } from '../../primitives/HelpButton';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import type { Measured } from '../../../api/schemas/base';
import { addDays, diffDays, fmtD } from '../../schedule/dates';
import type { Calc } from '../../schedule/progress';
import { NOT_MEASURED } from '../measured/measured.selectors';
import { keepInside, labelRect, placeLabel, type Bounds, type Placement, type Seg, type Side } from './chartLabels';

const MIN_WIDTH = 280;
const DAY = 86_400_000;
// The axis labels ("3h", right-aligned 6 px before the plot) start about as far in from the card's content edge as the plot ends before its
// right edge, and the plot starts 6 px under the card's body padding, so no empty band sits under the header (alignment audit XSH-16).
const PAD = { left: 28, right: 12, top: 6, bottom: 28 };
const MONO = 'IBM Plex Mono, monospace';
/** One character of the axis font at 11 px. */
const MONO_PX = 6.6;
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
  /** Says "Recorded days not measured yet" as a caption under the plot instead of inside it, where a narrow card puts it on a gridline and under
   * the "today" label (Production's 360 px card; alignment audit R4TA-2). */
  noteBelow?: boolean;
  /** Draws the header's "Open schedule" calendar button (Production's panel, the mock's `side-chart`); the Schedule page is already there and passes nothing. */
  onOpenSchedule?: () => void;
};

/** "Recorded vs plan": the plan dashed, the recorded days solid, the projection dotted, with the due line, today and the estimated finish. */
export function ProgressChart({
  k,
  wph,
  start,
  today,
  due,
  recordedHours,
  series,
  height: minHeight = 200,
  fill = false,
  title = 'Recorded vs plan',
  noteBelow = false,
  onOpenSchedule,
}: Props) {
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
  /* Each label goes beside its point on a side no line or other label crosses (chartLabels.ts): the due label first, where it is, then "today", then the estimated finish. */
  const bounds: Bounds = { left: PAD.left, right: width - 2, top: PAD.top, bottom: height - PAD.bottom };
  const lines: Seg[] = [];
  if (due) {
    lines.push({ x1: x(due), y1: PAD.top, x2: x(due), y2: height - PAD.bottom });
    if (planDays > 0) lines.push({ x1: x(start), y1: y(0), x2: x(due), y2: y(finishedHours) });
  }
  lines.push({ x1: x(today), y1: y(recordedHours), x2: x(k.finish), y2: y(finishedHours) });
  for (let i = 1; i < actual.length; i++) {
    lines.push({ x1: x(addDays(start, actual[i - 1][0])), y1: y(actual[i - 1][1]), x2: x(addDays(start, actual[i][0])), y2: y(actual[i][1]) });
  }
  const dueText = due ? `due ${fmtD(due)}` : '';
  const dueLabel: Placement | null = due
    ? keepInside({ x: x(due) + (x(due) < 96 ? 4 : -4), y: PAD.top + 10, anchor: x(due) < 96 ? 'start' : 'end' }, dueText, bounds)
    : null;
  const todayDot = { x: x(today), y: y(recordedHours) };
  // The dot itself is taken too, so a label that slides along its row never lands on it.
  const taken = [{ x1: todayDot.x - 6, y1: todayDot.y - 6, x2: todayDot.x + 6, y2: todayDot.y + 6 }];
  if (dueLabel) taken.push(labelRect(dueLabel, dueText));
  // Behind the plan (or with no room on the left) the plan runs above the dot, so below and right first; ahead of it the plan passes below, so above and left.
  const todaySides: Side[] =
    !aheadOfPlan || todayDot.x < PAD.left + 40
      ? ['right-below', 'left-below', 'right-above', 'left-above']
      : ['left-above', 'right-above', 'left-below', 'right-below'];
  const todayLabel = placeLabel('today', todayDot, bounds, lines, taken, todaySides);
  taken.push(labelRect(todayLabel, 'today'));
  const doneText = `done ${fmtD(k.finish)} (est.)`;
  const doneAt = { x: x(k.finish), y: y(finishedHours) };
  const doneSides: Side[] =
    doneAt.x < 130 ? ['right-above', 'left-above', 'right-below', 'left-below'] : ['left-above', 'right-above', 'left-below', 'right-below'];
  const doneLabel = placeLabel(doneText, doneAt, bounds, lines, taken, doneSides);
  // Gridlines up to the top of the scale (at most five), so the plot's top is a labelled line, not an empty band over the last one (XSH-16).
  const rowStep = Math.max(1, Math.ceil(yMax / 4));
  const rows = Array.from({ length: Math.floor(yMax / rowStep) + 1 }, (_, i) => i * rowStep);
  const summary = `Plan starts ${fmtD(start)}${due ? `, due ${fmtD(due)}` : ', no due date'}. Today is ${fmtD(today)}, ${recordedHours.toFixed(1)} of ${finishedHours.toFixed(1)} finished hours recorded. Estimated finish ${fmtD(k.finish)}.`;

  return (
    <Panel
      title={title}
      className="min-w-0"
      fill={fill}
      actions={
        (onOpenSchedule || !due) && (
          <div className="flex items-center gap-2">
            {!due && <HelpButton label="About the plan line">Set a due date to see the plan line.</HelpButton>}
            {onOpenSchedule && <IconButton action="calendar" label="Open schedule" onClick={onOpenSchedule} />}
          </div>
        )
      }
    >
      {/* Filling, the svg is laid over the box so what it draws never sets the card's height: the cell does. */}
      <div className={fill ? 'flex h-full flex-col' : undefined}>
        <div ref={box} className={fill ? 'relative w-full flex-1 overflow-hidden' : 'w-full overflow-hidden'} style={fill ? { minHeight } : { height }}>
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
            {weeks.map((d) => {
              const text = fmtD(addDays(start, d));
              // The last date would run past the card's edge centred on its tick, so it ends at the edge instead.
              const edge = width - 2;
              const half = (text.length * MONO_PX) / 2;
              const atEdge = x(addDays(start, d)) + half > edge;
              return (
                <text
                  key={d}
                  x={atEdge ? edge : x(addDays(start, d))}
                  y={height - 8}
                  textAnchor={atEdge ? 'end' : 'middle'}
                  fontSize="11"
                  fill="var(--text-muted)"
                  fontFamily={MONO}
                >
                  {text}
                </text>
              );
            })}
            {due && (
              <>
                <line x1={x(due)} x2={x(due)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--danger)" strokeDasharray="2 4" data-line="due" />
                {dueLabel && (
                  <text x={dueLabel.x} y={dueLabel.y} textAnchor={dueLabel.anchor} fontSize="11" fill="var(--danger-text)">
                    {dueText}
                  </text>
                )}
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
            {!series.ok && !noteBelow && (
              <text x={PAD.left + 8} y={(PAD.top + y(0)) / 2} fontSize="11" fill="var(--text-muted)">{`Recorded days ${NOT_MEASURED}`}</text>
            )}
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
            <text x={todayLabel.x} y={todayLabel.y} textAnchor={todayLabel.anchor} fontSize="11" fill="var(--text)">
              today
            </text>
            <text x={doneLabel.x} y={doneLabel.y} textAnchor={doneLabel.anchor} fontSize="11" fill="var(--text)">
              {doneText}
            </text>
          </svg>
        </div>
        {!series.ok && noteBelow && (
          <p className="mt-1 flex-none text-[0.75rem] text-[var(--text-muted)]" data-chart-note>
            {/* With no due date the plan line is missing; the "?" in the header says what draws it (XSH-18). */}
            {`Recorded days ${NOT_MEASURED}`}
          </p>
        )}
      </div>
      <p id={describedBy} className="sr-only">
        {summary}
      </p>
    </Panel>
  );
}
