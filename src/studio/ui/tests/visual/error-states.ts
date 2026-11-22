import type { Page } from '@playwright/test';
import type { NarrationApi } from '../../src/types';
import { goToPage, openAdvanced, openSettings, showSettingsRow } from './drivers/shared';

// The states error-shift.spec.ts measures: one page, drawn once with the host answering and once with the named host calls failing, and the
// elements outside the error's own slot must not move between the two (docs/design/design-system.md#errors, issue #4045).
//
// A registry beside tests/visual/catalog/, not a part of it: the catalog holds one picture per page state, and an entry here is a pair, the
// same page with the host answering and failing, compared box by box. A #4045 pull request that fixes a page adds its fixed states here, and
// adds the error's own picture to the catalog as any new state does. Every fix that keeps an error in a reserved slot (fix shape S in
// docs/research/2026-11-inline-error-audit.md) registers its pair here, with `slot` naming the slot: the guard in guards/inlineErrors.ts
// trusts a `min-h-` class, and only this spec sees whether the message fits in it.
//
// Builds new because: the existing query switches (`?mockSettings=save-fails`, `?mockProfileRead=fails`) and the catalog's failing-state
// drivers (catalog/settings.ts 'save-failed', catalog/master.ts 'profile-load-failed') fail a call from page load and draw one picture. This
// registry also fails a call only after the page has opened (a Pickups or Schedule read again), and compares two drawings. Where a state here
// is one the catalog already draws (a refused save, the profile read), it fails through the same switch (`failQuery`), on the same pane and
// row, and adds only the second drawing.
//
// What the spec does not measure: every `[role="status"]` and `[role="alert"]` subtree is left out, as the message itself may change, so a
// status role on a large container hides all the boxes in it. Give the role to the line that changes, not to the panel around it.
//
// A state that shifts today carries `expectShift`, the pull request of #4045 that fixes it and a neighbour that moves: the spec expects that
// neighbour to move, so the fix fails the spec until that pull request deletes the field.

/** One page's ok and failing pair. */
export interface ErrorState {
  /** `<page> / <state>`, as the catalog names a page (tests/visual/catalog/). */
  name: string;
  /** The mock api methods that reject while the host is failing, with the message they reject with. Not with `failQuery`. */
  failing?: Partial<Record<keyof NarrationApi, string>>;
  /**
   * An existing mock switch that fails the call from page load (`?mockSettings=save-fails`), which the failing drawing loads the page with
   * instead of `failing`: a state the catalog already draws fails the same way here.
   */
  failQuery?: string;
  /** `start`: they fail from the page's first call. `after-open`: they answer until `open` has run, then fail (only with `failing`). */
  failFrom: 'start' | 'after-open';
  /** Reaches the page in its ok state. */
  open: (page: Page) => Promise<void>;
  /** What makes the failing call happen after `open` (a save, a read again), run in both states; none when opening is enough. */
  provoke?: (page: Page) => Promise<void>;
  /**
   * Waits for the state to be drawn: in the failing run, for the error to show; in the run that answers, for what the answer draws. For an
   * `after-open` state the spec has already waited for every failing method's call to settle.
   */
  ready: (page: Page, failing: boolean) => Promise<void>;
  /** The error's own slot: it and what is in it may change. Elements with role status or alert, toasts and fixed layers are never measured. */
  slot?: string;
  /** While set, the spec expects `neighbour`, an element outside the error, to move by at least a pixel; `pr` is the #4045 pull request that stops it. */
  expectShift?: { pr: string; neighbour: string };
}

const WORKER_PLAN_FAILURE = 'The speech model could not be measured on this computer.';
const READ_FAILURE = 'The project did not answer.';

export const ERROR_STATES: ErrorState[] = [
  {
    // WorkerPlanNote keeps a slot three lines tall (frontend-primitives rule 7's fixed slot), but the plan the mock answers takes four lines at
    // 1440 and 1100, so the row is one line shorter when the plan cannot be worked out. Found by this spec; the slot is in a Settings row.
    name: 'settings / worker plan cannot be worked out',
    failing: { coverageWorkerPlan: WORKER_PLAN_FAILURE },
    failFrom: 'start',
    open: async (page) => {
      await openSettings(page, 'Speech to text');
      await openAdvanced(page);
      await showSettingsRow(page, 'stt.workers');
    },
    ready: async (page, failing) => {
      const note = page.locator('[data-row="stt.workers"] [data-live="workerPlan"]');
      await (failing ? note.filter({ hasText: WORKER_PLAN_FAILURE }) : note.filter({ hasNotText: 'Working out' })).waitFor();
    },
    slot: '[data-live="workerPlan"]',
    expectShift: { pr: 'PR 2', neighbour: '[data-row="stt.chunk"]' },
  },
  {
    // A delivery profile that cannot be read is a toast with Retry; the page keeps its frame and judges against the neutral profile.
    // The catalog's master 'profile-load-failed' (drivers/master.ts) fails it with the same switch.
    name: 'master / the delivery profile cannot be read',
    failQuery: '?mockProfileRead=fails',
    failFrom: 'start',
    open: async (page) => {
      await goToPage(page, 'Master & QC');
    },
    ready: async (page, failing) => {
      if (failing)
        await page
          .locator('[data-toast-region]')
          .getByText(/delivery profiles? could not be read/)
          .waitFor();
    },
  },
  {
    // The row's error line under the control is drawn only once a save fails, and the page adds its "cannot be saved" card (audit: SettingRowView:335,
    // SettingsPage:402). The same switch, pane and row as the catalog's settings 'save-failed' (drivers/settings.ts).
    name: 'settings / a save is refused',
    failQuery: '?mockSettings=save-fails',
    failFrom: 'start',
    open: async (page) => {
      await openSettings(page, 'App & updates');
      await showSettingsRow(page, 'app.notify');
    },
    provoke: async (page) => {
      await page.getByRole('switch', { name: /Tell me when a long task finishes/ }).click();
    },
    ready: async (page, failing) => {
      const row = page.locator('[data-row="app.notify"]');
      // Saved, the row marks the value as changed from the default; refused, it says why.
      await (failing ? row.getByText('The settings file is read-only.') : row.getByText('Changed', { exact: true })).waitFor();
    },
    expectShift: { pr: 'PR 2', neighbour: '[data-row="app.importClose"]' },
  },
  {
    // A read again that fails keeps the list and puts a strip above it (audit: PickupsTable:352).
    name: 'pickups / the list cannot be read again',
    failing: { pickupsList: READ_FAILURE },
    failFrom: 'after-open',
    open: async (page) => {
      await goToPage(page, 'Pickups');
      await page.getByRole('table').first().waitFor();
    },
    provoke: async (page) => {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    },
    ready: async (page, failing) => {
      if (failing) await page.getByText('Can’t tell if this list is current.').waitFor();
    },
    expectShift: { pr: 'PR 7', neighbour: 'table' },
  },
  {
    // The minute's read again that fails puts a strip above the heading (audit: SchedulePage:234).
    name: 'schedule / the schedule cannot be read again',
    failing: { productionPlan: READ_FAILURE },
    failFrom: 'after-open',
    open: async (page) => {
      await goToPage(page, 'Schedule');
    },
    provoke: async (page) => {
      await page.clock.fastForward(61_000);
    },
    ready: async (page, failing) => {
      if (failing) await page.getByText(/Couldn't read the schedule again/).waitFor();
    },
    expectShift: { pr: 'PR 8', neighbour: 'h1' },
  },
];
