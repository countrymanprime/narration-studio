/** Calendar dates as the plan writes them, "YYYY-MM-DD" (ADR 0323), worked on as local dates so a day is a day in every time zone. */
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

/** Hours as "h:mm". */
export const hm = (h: number): string => {
  const m = Math.max(0, Math.round(h * 60));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

export const num = (n: number): string => n.toLocaleString('en-US');

/** "Oct 14", or the text as written when it is not a real date (a hand-edited plan), never "Invalid Date". */
export const fmtIso = (s: string): string => (isIsoDate(s) ? fmtD(parseIso(s)) : s);

/** What the days to the due date say: "8 days left", "1 day left", "Due today", "2 days overdue". */
export const daysText = (daysLeft: number): string => {
  if (daysLeft === 0) return 'Due today';
  if (daysLeft === 1) return '1 day left';
  if (daysLeft > 1) return `${num(daysLeft)} days left`;
  return daysLeft === -1 ? '1 day overdue' : `${num(-daysLeft)} days overdue`;
};

/** Why a typed due date cannot be sent, or null when it can (an empty one clears the date). */
export const dueDateProblem = (text: string): string | null => {
  const t = text.trim();
  if (t === '' || isIsoDate(t)) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t} is not a real date.` : 'Write the due date as YYYY-MM-DD.';
};

/** How long ago, for a reading that has gone quiet: "just now", "3 min ago", "2 h ago". */
export const agoText = (ms: number): string => {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'less than a minute ago';
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
};
