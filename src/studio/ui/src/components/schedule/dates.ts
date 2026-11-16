import { plural } from '../../plural';

/** Calendar dates as the plan writes them, "YYYY-MM-DD", worked on as local dates so a day is a day in every time zone. */
const DAY = 86_400_000;

export const parseIso = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const iso = (d: Date): string =>
  `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Whole days from `b` to `a`. */
export const diffDays = (a: Date, b: Date): number =>
  Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / DAY);

/** "Sep 26" */
export const fmtD = (d: Date): string => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Whether `s` is a real calendar date written "YYYY-MM-DD", in the years 1000 to 9999 (JavaScript reads years under 100 as 19xx, so the day counts would be wrong). */
export const isIsoDate = (s: string): boolean => /^[1-9]\d{3}-\d{2}-\d{2}$/.test(s) && iso(parseIso(s)) === s;

/**
 * Hours as hours and minutes with their units, "5h 40m" ("0h 10m"), to the nearest minute: the one hours formatter (Production and Schedule), so a figure of hours beside lengths in
 * minutes and seconds ("10:12") cannot be read as minutes and seconds (#3443). Rounds, as the Production figures always did (61 s and 89 s read 0h 01m, 90 s 0h 02m);
 * negative and non-finite input read 0h 00m, as `clock` reads 0:00.
 */
export const hm = (h: number): string => {
  const m = Number.isFinite(h) ? Math.max(0, Math.round(h * 60)) : 0;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

/**
 * A figure written by `hm` spelled out for a screen reader: "5 hours 40 minutes", "10 minutes", "less than a minute" ("<0h 01m"). "0h 10m" is read letter by letter and "<" is dropped by
 * the usual punctuation settings, so an accessible name uses this and the visible text stays as `hm` wrote it. Text that is not an `hm` figure comes back unchanged.
 */
export const spokenHm = (text: string): string => {
  const match = /^(<)?(\d+)h (\d{2})m$/.exec(text);
  if (!match) return text;
  const [hours, minutes] = [Number(match[2]), Number(match[3])];
  if (match[1]) return 'less than a minute';
  return [hours > 0 ? plural(hours, 'hour') : '', minutes > 0 || hours === 0 ? plural(minutes, 'minute') : ''].filter(Boolean).join(' ');
};

export const num = (n: number): string => n.toLocaleString('en-US');

/** "Oct 14" in the year of `ref`, "Oct 14, 2031" in any other, so a date years away is not read as this year's. */
export const fmtDY = (d: Date, ref: Date): string =>
  d.getFullYear() === ref.getFullYear() ? fmtD(d) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Oct 14", or the text as written when it is not a real date (a hand-edited plan), never "Invalid Date". */
export const fmtIso = (s: string, ref: Date): string => (isIsoDate(s) ? fmtDY(parseIso(s), ref) : s);

/** What the days to the due date say, after "Due Oct 14 ·": "8 days left", "1 day left", "today", "2 days overdue". */
export const daysText = (daysLeft: number): string => {
  if (daysLeft === 0) return 'today';
  if (daysLeft === 1) return '1 day left';
  if (daysLeft > 1) return `${num(daysLeft)} days left`;
  return daysLeft === -1 ? '1 day overdue' : `${num(-daysLeft)} days overdue`;
};

/** The last year a due date or a milestone date may name: a year past it is a slip of the keyboard, and it would stretch the chart's axis over thousands of years. */
export const MAX_DATE_YEAR = 2100;

/** The sentence refusing a real date that is too far away, or null. */
export const farDateProblem = (text: string): string | null =>
  isIsoDate(text.trim()) && Number(text.trim().slice(0, 4)) > MAX_DATE_YEAR ? `Write a date no later than Dec 31, ${MAX_DATE_YEAR}.` : null;

/** Why a typed due date cannot be sent, or null when it can (an empty one clears the date). */
export const dueDateProblem = (text: string): string | null => {
  const t = text.trim();
  if (t === '') return null;
  if (isIsoDate(t)) return farDateProblem(t);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t} is not a real date.` : 'Write the due date as YYYY-MM-DD.';
};

/** How long ago, for a reading that has gone quiet: "just now", "3 min ago", "2 h ago". */
export const agoText = (ms: number): string => {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'less than a minute ago';
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
};
