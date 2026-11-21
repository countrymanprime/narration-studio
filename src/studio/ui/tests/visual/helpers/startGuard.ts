import type { Page } from '@playwright/test';

/** The Booth ignores a Stop within START_GUARD_MS of a start (useRecordControl.ts); a test that stops a take it just started waits this out first. */
const START_GUARD_PAUSE_MS = 1100;

export const pastStartGuard = (page: Page): Promise<void> => page.waitForTimeout(START_GUARD_PAUSE_MS);

/**
 * Runs the page's clock at `rate` of real time, as if the steps before a Stop had gone faster than they do here: a CI runner is quicker than a laptop, and a test that
 * clicks Stop about a second after its start can find the Booth's guard still up (#3931). Used on the tests that wait past the guard, so one that stops waiting fails here.
 */
export const slowPageClock = (page: Page, rate = 0.7): Promise<void> =>
  page.addInitScript((factor) => {
    const real = Date.now.bind(Date);
    const origin = real();
    Date.now = () => origin + (real() - origin) * factor;
  }, rate);
