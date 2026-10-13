// How to reach each `proof` state (the Studio Next Proof page) in STATE_CATALOG (see app.drivers.ts).
import type { Locator, Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, goToPage } from './shared';

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
  await page.getByRole('menuitemradio', { name: new RegExp(`^${chapterTitle}( — |$)`) }).click();
  await page.getByText('Open notes, by chapter').waitFor({ state: 'detached' });
  await page.getByText('Recording check', { exact: true }).waitFor();
}

export const proofDrivers: Record<string, Driver> = {
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
  'chapter-no-recording': async (page) => {
    await openProof(page);
    await openChapter(page, 'Chapter 2');
    await page.getByText('No recording for this chapter yet.').waitFor();
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
  'check-never': async (page) => {
    await openProof(page);
    await openChapter(page, 'Chapter 7');
    await page.getByText('Not checked yet').waitFor();
  },
  'check-checking': async (page) => {
    await openProof(page, 'mockCoverage=hold');
    await openChapter(page, 'Chapter 4');
    await notes(page).getByRole('button', { name: 'Check recordings…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('button', { name: /^Check / })
      .last()
      .click();
    // The run holds at its last step (?mockCoverage=hold), so the dialog reads the same at every viewport; it stays open while it runs.
    await dialog.getByText(/^Checking with /).waitFor();
    await page.getByText('Checking the recording against the script…').waitFor({ state: 'attached' });
  },
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
    await inspector(page).getByRole('textbox').fill('Heard it twice; the second read is right.');
  },
  empty: async (page) => {
    await openProof(page, 'mockFindings=empty', false);
    await page.getByText('No notes yet.').waitFor();
  },
};
