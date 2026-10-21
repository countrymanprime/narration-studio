import type { Page } from '@playwright/test';

/** The Booth ignores a Stop within START_GUARD_MS of a start (useRecordControl.ts); a test that stops a take it just started waits this out first. */
const START_GUARD_PAUSE_MS = 1100;

export const pastStartGuard = (page: Page): Promise<void> => page.waitForTimeout(START_GUARD_PAUSE_MS);
