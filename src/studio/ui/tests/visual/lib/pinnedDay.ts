import type { Page } from '@playwright/test';

/** The mock's own day: its seeds (due dates, a week's log) are dated against it, so a state that names a date or counts days reads the same on every run. */
export const MOCK_DAY = new Date(2026, 8, 26, 9, 0, 0);

/**
 * Page script that makes a page believe it started at `startMs` and then lets its clock tick on, so `new Date()`, `Date.now()` and `Date()` read that
 * day however late the run is. It is not a fake clock: timers, `performance` and `page.clock` are untouched, and no `__pwClock` is set, so a row that
 * shares one load across viewports stays valid. A driver that installs `page.clock` itself replaces it on purpose.
 */
export function pinnedDayScript(startMs: number): string {
  return `(${String((start: number) => {
    const Real = Date;
    const delta = start - Real.now();
    const Make = Real as unknown as new (...args: unknown[]) => Date;
    const PinnedDate = function (this: unknown, ...args: unknown[]): unknown {
      if (!new.target) return new Make(Real.now() + delta).toString();
      return args.length === 0 ? new Make(Real.now() + delta) : new Make(...args);
    };
    PinnedDate.prototype = Real.prototype;
    Object.setPrototypeOf(PinnedDate, Real);
    (PinnedDate as unknown as { now: () => number }).now = () => Real.now() + delta;
    (globalThis as { Date: unknown }).Date = PinnedDate;
  })})(${startMs})`;
}

/**
 * The next load of this page, and every one after it, starts on MOCK_DAY (drivers/shared.ts `onMockDay` reloads after calling this). The Production
 * home draws "done Nov 19 (est.)" from the real day, so two captures of one picture made either side of a midnight (CI shards run for half an hour)
 * differ, and the whole-run check reads that as a stale sameAs and an undeclared duplicate.
 */
export async function pinTheDay(page: Page): Promise<void> {
  await page.addInitScript(pinnedDayScript(MOCK_DAY.getTime()));
}
