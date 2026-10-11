/** Calendar dates as the plan writes them, "YYYY-MM-DD" (ADR 0323), worked on as local dates so a day is a day in every time zone. */
const DAY = 86_400_000;

export const parseIso = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Whole days from `b` to `a`. */
export const diffDays = (a: Date, b: Date): number =>
  Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / DAY);

/** "Sep 26" */
export const fmtD = (d: Date): string => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Whether `s` is a real calendar date written "YYYY-MM-DD". */
export const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parseIso(s)) === s;

/** Hours as "h:mm". */
export const hm = (h: number): string => {
  const m = Math.max(0, Math.round(h * 60));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

export const num = (n: number): string => n.toLocaleString('en-US');
