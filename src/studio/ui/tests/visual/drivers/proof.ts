// How to reach each `proof` state (the Studio Next Proof page) in STATE_CATALOG (see app.drivers.ts).
import { expect, type Locator, type Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, openCheckingLink, clickNav, goToPage, openWithoutManuscript } from './shared';

const notes = (page: Page): Locator => page.getByRole('region', { name: 'Notes' });
const inspector = (page: Page): Locator => page.getByRole('complementary', { name: 'Note' });

// Opens Proof (booted with a main.tsx mock seed first when one is given) and waits for its notes and the Inspector on the first one.
async function openProof(page: Page, seed?: string, rows = true, direct = false): Promise<void> {
  if (seed) {
    await page.goto(direct ? `/proof?${seed}` : `/?${seed}`);
    await settlePage(page);
  }
  if (!direct) await goToPage(page, 'Proof');
  await page.getByText('Open notes, by chapter').waitFor();
  if (rows) {
    await notes(page).locator('tr[data-row]').first().waitFor();
    await inspector(page).waitFor();
  }
}

// Picks one chapter in the head's chapter stepper and waits for its recording check card to have read the chapter.
async function openChapter(page: Page, chapterTitle: string): Promise<void> {
  await page.getByRole('button', { name: /^Chapter: .*\. Change chapter$/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${chapterTitle}(: | — |$)`) }).click();
  await page.getByText('Open notes, by chapter').waitFor({ state: 'detached' });
  await page.getByText('Recording check', { exact: true }).waitFor();
}

// A recording check held at its last transcribing step (?mockCoverage=<seed>), so the dialog reads the same at every viewport; it stays open while it runs.
async function checkHeld(page: Page, seed: 'hold' | 'hold-recheck' | 'hold-none' | 'hold-all'): Promise<void> {
  await openProof(page, `mockCoverage=${seed}`);
  await openChapter(page, 'Chapter 4');
  await notes(page).getByRole('button', { name: 'Check recordings…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: /^Check / })
    .last()
    .click();
  await dialog.getByText(/^Checking with /).waitFor();
  await dialog
    .getByRole('region', { name: 'Check activity' })
    .getByLabel(/^Chunks: 8 of 8/)
    .waitFor();
  await page.getByText('Checking the recording against the script…').waitFor({ state: 'attached' });
}

const TREAT_AS_SAME = 'Treat these two words as the same in later checks';

// Opens Proof on a `?mockFindings=misread…` seed, selects the one-word misread and returns its equals button (#2736), after checking that
// the button is inside the Inspector, nothing covers it and nothing in the Inspector sticks out of it (qa B3 on #2788: a long name once
// pushed a button out of its panel).
async function openMisread(page: Page, seed: 'misread' | 'misread-long' | 'misread-rtl', row: RegExp): Promise<Locator> {
  await openProof(page, `mockFindings=${seed}`, true, true);
  await notes(page).locator('tr[data-row]').filter({ hasText: row }).click();
  const button = inspector(page).getByRole('button', { name: TREAT_AS_SAME });
  await button.waitFor();
  await button.scrollIntoViewIfNeeded();
  const placed = await button.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const panel = el.closest('aside')!.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    const out = [...el.closest('aside')!.querySelectorAll('button, p, [data-quote]')].find((child) => {
      const r = child.getBoundingClientRect();
      // A hidden element (the empty status line) has no box at all.
      return r.width + r.height > 0 && (r.left < panel.left - 1 || r.right > panel.right + 1);
    });
    return {
      inside: box.left >= panel.left && box.right <= panel.right,
      topmost: !!top && el.contains(top),
      wide: out ? `${out.tagName} ${out.getAttribute('aria-label') ?? out.textContent?.slice(0, 40) ?? ''}` : null,
    };
  });
  expect(placed).toEqual({ inside: true, topmost: true, wide: null });
  return button;
}

export const proofDrivers: Record<string, Driver> = {
  'address-checking': async (page) => {
    await openCheckingLink(page, '/proof?chapter=gone');
  },
  'load-error': async (page) => {
    await page.goto('/?mockInvalidPayload=manuscript');
    await settlePage(page);
    await clickNav(page, 'Proof');
    await page.getByText('This page could not be loaded').waitFor();
    await page.getByRole('button', { name: 'Retry' }).waitFor();
  },
  loading: async (page) => {
    await page.goto('/?mockChapters=loading');
    await settlePage(page);
    await clickNav(page, 'Proof');
    await page.getByRole('status').filter({ hasText: 'Reading the chapters and notes' }).waitFor({ state: 'attached' });
  },
  default: async (page) => {
    await openProof(page);
  },
  chapter: async (page) => {
    await openProof(page, 'mockChapterLink=confirmed');
    await openChapter(page, 'Chapter 1');
    await page.locator('[data-pin]').first().waitFor();
    await page
      .getByLabel(/takes at this spot/)
      .first()
      .waitFor();
  },
  'note-thread': async (page) => {
    await openProof(page);
    const thread = inspector(page).getByRole('region', { name: 'Notes on this finding' });
    const add = async (who: 'My note' | 'Proofer replied', text: string) => {
      await thread.getByRole('button', { name: who }).click();
      await thread.getByRole('textbox', { name: 'Add a note' }).fill(text);
      await thread.getByRole('button', { name: 'Add note' }).click();
      await thread.getByText(text).waitFor();
    };
    await add('My note', 'Is this the room or a misread? Ask the proofer.');
    await add('Proofer replied', 'A misread: the script says "pink eyes".');
    // Below the wide layout the Inspector stacks under the queue, out of the window: bring the thread up, or the picture is `default`'s.
    await thread.scrollIntoViewIfNeeded();
  },
  'hear-it': async (page) => {
    await openProof(page);
    await notes(page)
      .locator('tr[data-row]')
      .filter({ hasText: /pink eyes/ })
      .click();
    await inspector(page).getByRole('button', { name: 'Hear it, 3 s either side' }).click();
    await inspector(page).getByRole('button', { name: 'Stop hearing it' }).waitFor();
    const where = inspector(page).getByText(/^Playing in REAPER, 3 s either side/);
    await where.waitFor();
    // The paragraph at the top of the window and the message under the row below it, at every width (below the wide layout the
    // Inspector stacks under the queue, out of the window).
    await inspector(page)
      .getByRole('region', { name: 'In the script' })
      .evaluate((region) => region.scrollIntoView({ block: 'start' }));
  },
  'treat-as-same': async (page) => {
    const button = await openMisread(page, 'misread', /Dinah/);
    await button.focus();
  },
  'treat-as-same-added': async (page) => {
    const button = await openMisread(page, 'misread', /Dinah/);
    await button.click();
    await page.getByRole('status').getByText('Added equivalence: Dinah = Dina').waitFor();
    await button.and(page.locator(':not([aria-busy])')).waitFor();
  },
  'treat-as-same-long': async (page) => {
    await openMisread(page, 'misread-long', /Pneumono/);
    // The capture shows the quotes the long words are in.
    await inspector(page).locator('[data-quote="script"]').scrollIntoViewIfNeeded();
  },
  'treat-as-same-rtl': async (page) => {
    await openMisread(page, 'misread-rtl', /שלם/);
    await inspector(page).locator('[data-quote="script"]').scrollIntoViewIfNeeded();
  },
  'chapter-no-recording': async (page) => {
    await openProof(page);
    await openChapter(page, 'Chapter 2');
    await page.getByText('This chapter has no recording to check.').waitFor();
  },
  'takes-lanes': async (page) => {
    await openProof(page, 'mockChapterLink=confirmed');
    await openChapter(page, 'Chapter 1');
    await notes(page)
      .locator('tr[data-row]')
      .filter({ hasText: /pink eyes/ })
      .click();
    await page.locator('[data-band]').first().waitFor();
    await inspector(page).getByRole('region', { name: 'Takes at this spot' }).waitFor();
  },
  'check-stale': async (page) => {
    await openProof(page, 'mockCoverage=stale');
    await openChapter(page, 'Chapter 4');
    await page.getByText('Out of date').waitFor();
  },
  // #2800: a note the retired take review saved has no time; it stays listed under In view and its DAW controls say why they are off.
  'retired-take-review-note': async (page) => {
    await openProof(page, 'mockCoverage=pickups');
    await openChapter(page, 'Chapter 4');
    await notes(page)
      .locator('tr[data-row]')
      .filter({ hasText: /Partial pickup/ })
      .click();
    await inspector(page).getByText('This note has no time in its audio to go to.').waitFor();
  },
  // Issue #2251 item 30: the check card's findings, with the mock's line said twice.
  'check-findings': async (page) => {
    await openProof(page, 'mockChapterLink=confirmed');
    await openChapter(page, 'Chapter 1');
    await page.getByRole('button', { name: /Show the findings/ }).click();
    await page.getByRole('link', { name: /^Open in Editing: Said twice/ }).waitFor();
  },
  'check-never': async (page) => {
    await openProof(page);
    await openChapter(page, 'Chapter 7');
    await page.getByText('Not checked yet').waitFor();
  },
  'check-recordings-dialog': async (page) => {
    await openProof(page);
    await openChapter(page, 'Chapter 4');
    await notes(page).getByRole('button', { name: 'Check recordings…' }).click();
    await page.getByRole('dialog').getByRole('combobox', { name: 'Chapters at once' }).waitFor();
  },
  'check-checking': async (page) => checkHeld(page, 'hold-recheck'),
  // The mock's check runs on its own to the end: the dialog then shows that chapter's result under the stopped activity box.
  'check-finished': async (page) => {
    await openProof(page, 'mockCoverage=cascade');
    await openChapter(page, 'Chapter 4');
    await notes(page).getByRole('button', { name: 'Check recordings…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('button', { name: /^Check / })
      .last()
      .click();
    await dialog.getByRole('region', { name: 'Check activity' }).getByText('Done', { exact: true }).waitFor();
  },
  'check-checking-none': async (page) => checkHeld(page, 'hold-none'),
  'check-checking-all': async (page) => checkHeld(page, 'hold-all'),
  'notes-filtered': async (page) => {
    await openProof(page, 'mockChapterLink=none');
    await notes(page)
      .getByRole('button', { name: /^To review/ })
      .click();
    await notes(page).getByRole('heading', { name: /of 4$/ }).waitFor();
  },
  'find-open': async (page) => {
    await openProof(page, 'mockChapterLink=none');
    await notes(page).getByRole('button', { name: 'Find in notes' }).click();
    await notes(page).getByPlaceholder('Find in notes').fill('rabbit');
    await notes(page).getByRole('heading', { name: /of 4$/ }).waitFor();
  },
  'search-menu': async (page) => {
    await openProof(page, 'mockChapterLink=none');
    await page.keyboard.press('Control+f');
    await page.getByRole('combobox', { name: 'Jump menu' }).fill('rabbit');
    await page.getByText('Notes', { exact: true }).waitFor();
    await page.getByRole('listbox', { name: 'Jump menu results' }).getByRole('option').first().waitFor();
  },
  'evidence-changed': async (page) => {
    // The seed's analyzer runs again once the page has read the notes, so opening the note's chapter reads it with new evidence: the
    // Inspector keeps the evidence it showed, puts up the banner and holds every decision until the new evidence is taken.
    // Opened straight on Proof: the Production home also lists the notes (for its Proof cells), and the seed re-runs after the first list.
    await openProof(page, 'mockFindings=changed', true, true);
    await notes(page)
      .locator('tr[data-row]')
      .filter({ hasText: /pink eyes/ })
      .click();
    await inspector(page).getByText('The evidence changed', { exact: true }).waitFor();
    await inspector(page)
      .getByRole('textbox', { name: /Note with the decision/ })
      .fill('Heard it twice; the second read is right.');
    // The Inspector is taller than the window with its thread; the banner is the state, so it is what the capture shows.
    await inspector(page).getByText('The evidence changed', { exact: true }).scrollIntoViewIfNeeded();
  },
  empty: async (page) => {
    await openProof(page, 'mockFindings=empty', false);
    await page.getByText('A note shows here once a check finds one.').waitFor();
  },
  'no-manuscript': async (page) => {
    await openWithoutManuscript(page, 'Proof');
  },
};
// The whole page of default (catalog/shared.ts: wholePage), driven the same way.
proofDrivers['whole-page'] = proofDrivers['default'];
