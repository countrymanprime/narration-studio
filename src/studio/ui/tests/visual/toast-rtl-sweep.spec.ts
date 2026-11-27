// A runtime sweep for #4113 / #4129: nine flows that raise a toast are driven on a build whose chapters, a REAPER track, characters and microphones carry long Arabic
// names (helpers/rtlNames.ts). A recorder on the toast region keeps every toast shown with its computed direction, and the sweep fails a toast that
//   - is laid out right to left while its own words (outside the names and the isolates) are English,
//   - holds a right-to-left letter outside an isolate among those English words (a name, or a piece of one, a builder did not isolate), or
//   - holds one of the Arabic names outside an isolate (U+2066 or U+2068 \u2026 U+2069).
// The judge does not call the app's own `textDirection`, so a regression in that rule is seen, not agreed with (helpers/toastSweepCheck.ts).
// The source guard (src/isolatedNames.guard.test.ts) reads what is written; this reads what is drawn.
// A flow has to show the toast it is about (a driver that stops doing anything fails), and a gap that is known and written in KNOWN fails when it stops failing.
// What it covers: Production (stage, remove and restore), Booth (link, create, microphone), the Story Bible (delete) and the Engine panel's Chapter links (create, check again): 9 flows in 5 areas.
// What it does not: the other call sites of isolatedIfRtl and bidiIsolated (35 files outside tests), the sentences the host (Go) words (#4126), and the pages and flows listed in the PR.
// Mock only: no REAPER, no Go host.
import { expect, test, type Page } from '@playwright/test';
import { QUIET_MS } from '../../src/quietWindow';
import { clickVisible, confirmDialog, goToPage, openBooth, openEnginePanel, openStageEvidence, productionLoaded, rowMenu } from './drivers/shared';
import { arabicNames, ARABIC_NAMES, ARABIC_VALUES, CHAPTER_TITLES, MISSING_MICROPHONE, startsWithTitle } from './helpers/rtlNames';
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
        const direction = getComputedStyle(el).direction;
        // Keyed on the text and the direction: a toast whose `dir` changes after its text was recorded is recorded again.
        if (text !== '' && !seen.some((toast) => toast.text === text && toast.direction === direction)) seen.push({ text, direction });
      }
    };
    new MutationObserver(read).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}

const shown = (page: Page): Promise<Shown[]> => page.evaluate(() => (window as unknown as { __sweep: Shown[] }).__sweep.slice());

type Flow = {
  name: string;
  /** Drives the page until the toast(s) this flow raises are on screen. */
  drive: (page: Page) => Promise<void>;
  /** A toast whose text holds this must have been shown (a driver that does nothing fails). */
  expectText: RegExp;
};

/**
 * Gaps that fail today, by flow name: what the sweep says is wrong (`problem`, a part of its message), the reason, and the issue that holds the work.
 * The flow must fail with that problem, not with any problem, and the sweep fails when a listed flow stops failing, so an entry never outlives its gap.
 */
const KNOWN: Readonly<Record<string, { problem: string; reason: string; issue: string }>> = {};

/** A chapter's track slide-over, opened from the board row's menu on a project that has `seed` (main.tsx's `?mockChapterLink=`). */
async function openTrack(page: Page, title: string, seed: string) {
  await page.goto(`/?${seed}`);
  await settlePage(page);
  await productionLoaded(page);
  await rowMenu(page, startsWithTitle(title), 'Chapter track\u2026');
  const dialog = page.getByRole('dialog', { name: /^Track: / });
  await dialog.getByText('Reading the saved project\u2026').waitFor({ state: 'detached' });
  return dialog;
}

/** The Chapter links table of the Audio engine panel, scrolled into view. */
async function chapterLinks(page: Page) {
  const panel = await openEnginePanel(page);
  const table = panel.getByRole('table', { name: 'Chapter links' });
  await table.scrollIntoViewIfNeeded();
  return table;
}

const FLOWS: readonly Flow[] = [
  {
    name: 'Production: confirm a stage suggestion',
    drive: async (page) => {
      const view = await openStageEvidence(page, startsWithTitle(CHAPTER_TITLES[4]));
      await view.getByRole('button', { name: 'Confirm', exact: true }).click();
    },
    expectText: /moved to/,
  },
  {
    name: 'Production: revert a confirmed stage',
    drive: async (page) => {
      const view = await openStageEvidence(page, startsWithTitle(CHAPTER_TITLES[4]));
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
      // The second body row is Chapter 1 (the opening credits come first, and a credits row names no chapter): the mock's track for it carries the chapter's Arabic title, so it is linked.
      const row = table.locator('tbody tr').nth(1);
      await row.getByRole('button', { name: /^Change the track for/ }).click();
      const check = row.getByRole('button', { name: /^Check the link for/ });
      await check.waitFor();
      // A press right after the swap is ignored (QUIET_MS), as a narrator's would be if it were a double click.
      await page.waitForTimeout(QUIET_MS + 50);
      await check.click();
    },
    // The toast quotes the track: its name is an Arabic one, so a quoted() that stops isolating it fails here.
    expectText: /is linked to \u201C/,
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
    // Let the queue empty before the last read: a toast raised after the expected one is judged too.
    await expect(page.locator('[data-toast-text]')).toHaveCount(0, { timeout: 30_000 });
    const all = await shown(page);
    // The flow ran on the Arabic data: a toast that names nothing from it means the swap or the driver did nothing.
    expect(
      all.some((toast) => flow.expectText.test(toast.text) && ARABIC_VALUES.some((name) => toast.text.includes(name))),
      `the toast matching ${flow.expectText} names one of the Arabic names; shown: ${JSON.stringify(all)}`,
    ).toBe(true);
    const found = problems(all, ARABIC_VALUES);
    const known = KNOWN[flow.name];
    if (known) {
      const why = `${flow.name} is listed as a known gap (${known.reason}, ${known.issue}); delete the entry once it passes. Found: ${JSON.stringify(found)}`;
      expect(
        found.some((problem) => problem.includes(known.problem)),
        why,
      ).toBe(true);
    } else expect(found).toEqual([]);
  });
}

test('toast sweep: every KNOWN entry names a flow that exists', () => {
  const names = FLOWS.map((flow) => flow.name);
  expect(Object.keys(KNOWN).filter((name) => !names.includes(name))).toEqual([]);
});
