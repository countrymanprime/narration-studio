// The one way a day is written in prose (alignment audit R3SE1-6): "Jan 1, 2026", in the narrator's own time zone, so the Manuscript row,
// the import dialog it opens and the update box name the same event the same way.

/** The day of a host timestamp (ISO 8601) as "Jan 1, 2026" in local time; a value that is not a date is returned as it came. */
export function calendarDay(iso: string): string {
  const day = new Date(iso);
  return Number.isNaN(day.getTime()) ? iso : day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
