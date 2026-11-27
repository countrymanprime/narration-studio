// The runtime sweep behind #4113 / #4129: every flow that raises a toast is driven on a build whose chapters, tracks, characters and microphones carry long Arabic names
// (helpers/rtlNames.ts), a recorder on the toast region keeps every toast shown with its computed direction, and the sweep fails any toast that
//   - is laid out right to left while the app's own words are mostly English (`textDirection(text)` is `ltr`): the toast did not take the rule, or
//   - holds one of the Arabic names outside an isolate (U+2066 or U+2068 \u2026 U+2069): a builder forgot to isolate a name the narrator chose.
// The source guard (src/isolatedNames.guard.test.ts) reads what is written; this reads what is drawn, so it also sees a sentence that reaches a toast through a value, an alias or the host.
// A flow that has to show a toast is not allowed to show none (a driver that stops doing anything fails), and a gap that is known and written in KNOWN fails when it stops failing.
// Mock only: no REAPER, no Go host; the host's own sentences are #4126.
import { expect, test, type Page } from '@playwright/test';
import { clickVisible, confirmDialog, goToPage, openBooth, productionLoaded } from './drivers/shared';
import { arabicNames, ARABIC_NAMES, ARABIC_VALUES, CHAPTER_TITLES, MISSING_MICROPHONE } from './helpers/rtlNames';
import { settlePage } from './helpers/settle';
import { problems, type Shown } from './helpers/toastSweepCheck';

/** Installs the recorder before the app loads: every distinct toast text that reaches `[data-toast-text]`, with the direction the browser computed for it. */
async function recordToasts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: { text: string; direction: string }[] = [];
    (window as unknown as { __sweep: typeof seen }).__sweep = seen;
    const read = () => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-toast-text]')) {
        const text = el.textContent ?? '';
        if (text !== '' && seen[seen.length - 1]?.text !== text) seen.push({ text, direction: getComputedStyle(el).direction });
      }
    };
    new MutationObserver(read).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}

const shown = (page: Page): Promise<Shown[]> => page.evaluate(() => (window as unknown as { __sweep: Shown[] }).__sweep.slice());

/** A chapter's row in the Production pipeline, found by its title (the shared drivers match "Chapter 4" with an ASCII word boundary, which an Arabic title has none of). */
const boardRow = (page: Page, title: string) =>
  page
    .getByRole('table', { name: 'Chapter pipeline' })
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: title }) });

/** The stage readiness slide-over of one chapter on the `mixed` stage seed (the same steps as drivers/shared.ts's openStageEvidence). */
async function openStage(page: Page, title: string) {
  await page.goto('/?mockStages=mixed');
  await settlePage(page);
  await productionLoaded(page);
  await boardRow(page, title)
    .getByRole('button', { name: /^Stage readiness: / })
    .click();
  const view = page.getByRole('dialog', { name: 'Stage readiness' });
  await view.locator('[data-verdict-pill]').waitFor();
  return view;
}

type Flow = {
  name: string;
  /** Drives the page until the toast(s) this flow raises are on screen. */
  drive: (page: Page) => Promise<void>;
  /** A toast whose text holds this must have been shown (a driver that does nothing fails). */
  expectText: RegExp;
};

/** Gaps that fail today, by flow name: the reason, and the issue that holds the work. The sweep fails when a listed flow stops failing, so an entry never outlives its gap. */
const KNOWN: Readonly<Record<string, { reason: string; issue: string }>> = {};

/** A chapter's track slide-over, opened from the board row's menu on a project that has `seed` (main.tsx's `?mockChapterLink=`). */
async function openTrack(page: Page, title: string, seed: string) {
  await page.goto(`/?${seed}`);
  await settlePage(page);
  await productionLoaded(page);
  await boardRow(page, title).getByRole('cell').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Chapter track\u2026' }).click();
  const dialog = page.getByRole('dialog', { name: /^Track: / });
  await dialog.getByText('Reading the saved project\u2026').waitFor({ state: 'detached' });
  return dialog;
}

/** The Chapter links table of the Audio engine panel (the shared driver's steps), scrolled into view. */
async function chapterLinks(page: Page) {
  await page
    .locator('header')
    .getByRole('button', { name: /^REAPER: / })
    .click();
  const panel = page.getByRole('dialog', { name: 'Audio engine' });
  await panel.getByRole('region', { name: 'REAPER project' }).waitFor();
  await panel.getByRole('status').filter({ hasText: 'Looking for the REAPER project file\u2026' }).waitFor({ state: 'detached' });
  const table = page.getByRole('table', { name: 'Chapter links' });
  await table.scrollIntoViewIfNeeded();
  return table;
}

const FLOWS: readonly Flow[] = [
  {
    name: 'Production: confirm a stage suggestion',
    drive: async (page) => {
      const view = await openStage(page, CHAPTER_TITLES[4]);
      await view.getByRole('button', { name: 'Confirm', exact: true }).click();
    },
    expectText: /moved to/,
  },
  {
    name: 'Production: revert a confirmed stage',
    drive: async (page) => {
      const view = await openStage(page, CHAPTER_TITLES[4]);
      await view.getByRole('button', { name: 'Confirm', exact: true }).click();
      await view.getByRole('button', { name: 'Revert', exact: true }).click();
    },
    expectText: /moved back to/,
  },
  {
    name: 'Production: remove a chapter from recording, then restore it',
    drive: async (page) => {
      const dialog = await openTrack(page, CHAPTER_TITLES[1], 'mockChapterLink=confirmed');
      await dialog.getByRole('button', { name: 'Remove from recording\u2026' }).click();
      await page
        .getByRole('alertdialog', { name: /^Remove .* from recording\?$/ })
        .getByRole('button', { name: 'Remove from recording', exact: true })
        .click();
      await page
        .getByRole('button', { name: /^Restore/ })
        .first()
        .click();
    },
    expectText: /restored\./,
  },
  {
    name: 'Booth: link a track to the chapter',
    drive: async (page) => {
      await openBooth(page, '?mockReaperState=no_link');
      const dialog = page.getByRole('dialog', { name: /is not linked to a track$/ });
      await dialog.getByRole('combobox', { name: /^Track for / }).selectOption({ index: 1 });
      await dialog.getByRole('button', { name: 'Link track' }).click();
    },
    expectText: /is linked to its track/,
  },
  {
    name: 'Booth: create a new track for the chapter',
    drive: async (page) => {
      await openBooth(page, '?mockReaperState=no_link');
      const dialog = page.getByRole('dialog', { name: /is not linked to a track$/ });
      await dialog.getByRole('button', { name: 'Create a new track' }).click();
    },
    expectText: /is in REAPER, linked here/,
  },
  {
    name: 'Booth: the chosen microphone is not found',
    drive: async (page) => {
      // The microphone the narrator chose before (the Booth's own storage key); the built-in recorder no longer lists it.
      await page.addInitScript((device) => window.localStorage.setItem('narration.teleprompter.device', device), MISSING_MICROPHONE);
      await openBooth(page, '?mockEngine=builtin&mockRecorder=mic-gone');
      await page
        .getByRole('button', { name: /^Record$/ })
        .and(page.locator(':enabled:not([aria-disabled="true"])'))
        .click();
    },
    expectText: /was not found/,
  },
  {
    name: 'Story Bible: delete an entry',
    drive: async (page) => {
      await page.goto('/');
      await settlePage(page);
      await goToPage(page, 'Story Bible');
      await page.getByRole('table', { name: 'Story Bible entries' }).locator('[data-entry-id]').filter({ hasText: ARABIC_NAMES['White Rabbit'] }).click();
      const unlock = page.getByRole('button', { name: 'Unlock entry' });
      if (await unlock.count()) await unlock.click();
      await clickVisible(page, 'button', 'Edit this entry');
      await clickVisible(page, 'button', 'Delete entity');
      await confirmDialog(page, 'Delete entry')
        .getByRole('button', { name: /^Delete/ })
        .click();
    },
    expectText: /^Deleted /,
  },
  {
    name: 'Engine: Chapter links, create a track for a chapter',
    drive: async (page) => {
      await page.goto('/?mockChapterLink=none');
      await settlePage(page);
      const table = await chapterLinks(page);
      // By position: the row stops matching a "has a create button" filter the moment it is linked. The second body row is Chapter 1 (the opening credits come first).
      await table
        .locator('tbody tr')
        .nth(1)
        .getByRole('button', { name: /^Create a track for / })
        .click();
    },
    expectText: /^Created the track/,
  },
  {
    name: 'Engine: Chapter links, check a link again',
    drive: async (page) => {
      await page.goto('/');
      await settlePage(page);
      const table = await chapterLinks(page);
      // The second body row is Chapter 1 (the opening credits come first, and a credits row names no chapter).
      const row = table.locator('tbody tr').nth(1);
      await row.getByRole('combobox').selectOption({ index: 1 });
      await row.getByRole('button', { name: /^Use this (track|folder) for/ }).click();
      const change = row.getByRole('button', { name: 'Change the track' });
      await change.waitFor();
      // A press right after the swap is ignored (QUIET_MS), as a narrator's would be if it were a double click.
      await page.waitForTimeout(700);
      await change.click();
      const check = row.getByRole('button', { name: /^Check the link for/ });
      await check.waitFor();
      await page.waitForTimeout(700);
      await check.click();
    },
    expectText: /is linked to|no longer in the project/,
  },
];

for (const flow of FLOWS) {
  test(`toast sweep: ${flow.name}`, async ({ page }) => {
    await arabicNames(page);
    await recordToasts(page);
    await flow.drive(page);
    await settlePage(page);
    // Toasts show one at a time, each for a few seconds: a flow that raises two shows the second when the first is gone.
    await expect
      .poll(async () => (await shown(page)).some((toast) => flow.expectText.test(toast.text)), {
        message: `a toast matching ${flow.expectText} was shown`,
        timeout: 20_000,
      })
      .toBe(true);
    const all = await shown(page);
    // The flow ran on the Arabic data: a toast that names nothing from it means the swap or the driver did nothing.
    expect(
      all.some((toast) => flow.expectText.test(toast.text) && ARABIC_VALUES.some((name) => toast.text.includes(name))),
      `the toast matching ${flow.expectText} names one of the Arabic names; shown: ${JSON.stringify(all)}`,
    ).toBe(true);
    const found = problems(all, ARABIC_VALUES);
    const known = KNOWN[flow.name];
    if (known) expect(found, `${flow.name} is listed as a known gap (${known.reason}, ${known.issue}); delete the entry once it passes`).not.toEqual([]);
    else expect(found).toEqual([]);
  });
}
