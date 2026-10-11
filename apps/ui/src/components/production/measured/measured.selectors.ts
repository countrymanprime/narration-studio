// The sourced numbers of Production and Schedule, as pure selectors over what the measurements port answered (ADR 0015,
// ADR 0801). Each takes the answers as arguments, so it tests without a port, and returns a value or the reason there is
// none. A screen prints NOT_MEASURED for a reason; no constant here stands in for a missing figure.
import type { Measured } from '../../../api/schemas/base';
import type { TakeLogEntry } from '../../../fixtures/measurements';

/** The one text for a figure with no source. */
export const NOT_MEASURED = 'not measured yet';

// A selector imports types only (ADR 0770), so the two date helpers it needs are local; the dates are local calendar days.
const DAY = 86_400_000;
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a: Date, b: Date): number =>
  Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / DAY);

const HOUR_SECONDS = 3600;
const WEEK_DAYS = 7;
const MINUTE_SECONDS = HOUR_SECONDS / 60;

/** The plan has no start field: it began on the first of the month in which work began, taken from today. */
export const planStart = (today: Date): Date => new Date(today.getFullYear(), today.getMonth(), 1);

/** "Room −64.1 dB" (a real minus sign, one decimal), or "Room not measured yet". */
export function roomToneLabel(tone: Measured<number>): string {
  return tone.ok ? `Room ${tone.value.toFixed(1).replace('-', '−')} dB` : `Room ${NOT_MEASURED}`;
}

const dayOf = (at: string): Date => {
  const [y, m, d] = at.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Recorded audio as the cumulative finished hours at the end of each day, counted in days from the plan start. Starts at [0, 0]. */
export function recordedSeries(log: Measured<readonly TakeLogEntry[]>, start: Date): Measured<Array<[number, number]>> {
  if (!log.ok) return log;
  const byDay = new Map<number, number>();
  for (const entry of log.value) {
    const day = diffDays(dayOf(entry.at), start);
    if (day >= 0) byDay.set(day, (byDay.get(day) ?? 0) + entry.seconds);
  }
  let total = 0;
  const points: Array<[number, number]> = [[0, 0]];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    total += byDay.get(day) ?? 0;
    points.push([day, total / HOUR_SECONDS]);
  }
  return { ok: true, value: points };
}

export type WeekFigures = {
  /** Seconds of finished audio recorded in the last seven days. */
  week: Measured<number>;
  /** What the plan asks of a week, in seconds: the book's finished length spread evenly from the plan start to the due date. Null without a usable due date. */
  target: number | null;
  /** Seconds recorded in the last 24 hours. */
  last24h: Measured<number>;
};

const within = (log: readonly TakeLogEntry[], from: Date, to: Date): number =>
  log.filter((e) => new Date(e.at) > from && new Date(e.at) <= to).reduce((sum, e) => sum + e.seconds, 0);

/** The windows end with the last minute of `today`; the target uses the book's finished hours (its words at the estimate's WPH, worked out by the caller) and the plan's due date. */
export function weekFigures(log: Measured<readonly TakeLogEntry[]>, today: Date, start: Date, due: Date | null, finishedHours: number): WeekFigures {
  const planDays = due ? diffDays(due, start) : 0;
  const target = planDays > 0 ? Math.round((finishedHours * HOUR_SECONDS * WEEK_DAYS) / planDays) : null;
  if (!log.ok) return { week: log, target, last24h: log };
  const end = new Date(addDays(today, 1).getTime() - 1);
  return {
    week: { ok: true, value: within(log.value, addDays(end, -WEEK_DAYS), end) },
    target,
    last24h: { ok: true, value: within(log.value, addDays(end, -1), end) },
  };
}

/** Minutes in the booth to redo the pickups: at least 1 when there are any, 0 for none. */
export function sessionMinutes(seconds: Measured<number>): Measured<number> {
  if (!seconds.ok) return seconds;
  return { ok: true, value: seconds.value > 0 ? Math.max(1, Math.round(seconds.value / MINUTE_SECONDS)) : 0 };
}
