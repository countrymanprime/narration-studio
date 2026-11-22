import type { Page } from '@playwright/test';
import { slowClockSource } from '../../../scripts/slow-clock.mjs';

/** The Booth ignores a Stop within START_GUARD_MS of a start (useRecordControl.ts); a test that stops a take it just started waits this out first. */
const START_GUARD_PAUSE_MS = 1100;

/**
 * Waits START_GUARD_PAUSE_MS on the page's own clock, the one the guard reads: a wait in real time is shorter than the guard when the page's clock runs slow
 * (`slowPageClock`), and was only as long as the guard because the page's clock and the test's agree. Not for a test whose page clock is paused or frozen
 * (`page.clock.pauseAt`), where it never ends, nor across a navigation, which destroys the page it runs in.
 */
export const pastStartGuard = (page: Page): Promise<void> =>
  page.evaluate(
    (pause) =>
      new Promise<void>((resolve) => {
        const end = Date.now() + pause;
        const tick = () => (Date.now() >= end ? resolve() : void setTimeout(tick, 25));
        tick();
      }),
    START_GUARD_PAUSE_MS,
  );

/**
 * Runs the page's clock at `rate` of real time, as if the steps before a Stop had gone faster than they do here: a CI runner is quicker than a laptop, and a test that
 * clicks Stop about a second after its start can find the Booth's guard still up (#3931). Used on the tests that wait past the guard, so one that stops waiting fails here.
 * The same source as the nightly run's build (`scripts/slow-clock.mjs`, .github/workflows/slow-clock.yml), which slows the clock once if both apply.
 */
export const slowPageClock = (page: Page, rate = 0.7): Promise<void> => page.addInitScript(slowClockSource(rate));
