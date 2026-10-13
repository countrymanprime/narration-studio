// How to reach each `booth` state in STATE_CATALOG (see app.drivers.ts): the Booth page, reached through the nav as a narrator would.
// It opens on Chapter 1 (the mock's last chapter read) unless a state picks otherwise. The Companion rows open `/companion`.
import type { Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, chooseTheme, goToPage, openBooth, selectReaderWord } from './shared';

// The record capability on, so Record is enabled (the mock's REAPER keeps it switched off by default, which is the refusal row).
const RECORD_ON = '?mockRecordCapabilityOn=1';
// Where the page clock stops once Record is pressed, so the timer reads 00:00 at every viewport.
const REC_START = new Date('2026-09-28T10:00:00Z').getTime();
// The seams boot a session already 30 words into the first paragraph (word 35 of the chapter). Wait for the highlight to
// land there so the shot is never taken mid-walk.
const LISTENING_WORD = '[data-word="32"] [data-highlight="Cursor"]';

const record = (page: Page) => page.getByRole('button', { name: /^Record$/ });

async function readyToRecord(page: Page, query = RECORD_ON): Promise<void> {
  await openBooth(page, query);
  await page.getByRole('button', { name: /^Resume at ¶/ }).waitFor();
  await record(page).and(page.locator(':enabled')).waitFor();
}

// A take running on a paused clock; focus leaves Stop, so the page's own keys (Escape, R) reach the page as they do once the
// narrator reads on.
async function startTake(page: Page, query = RECORD_ON): Promise<void> {
  await readyToRecord(page, query);
  await page.clock.install({ time: REC_START });
  await page.clock.pauseAt(REC_START + 1_000);
  await record(page).click();
  await page.getByRole('button', { name: /^Stop$/ }).waitFor();
  await page.getByText('REC', { exact: true }).waitFor();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

// The Companion has no rail item: the jump menu's Open Companion opens it (commands.catalog.ts `companion.open`).
async function openCompanion(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await settlePage(page);
  await page.getByRole('heading', { level: 1, name: 'Production' }).waitFor();
  await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox', { name: 'Jump menu' }).fill('Open Companion');
  await page
    .getByRole('option', { name: /^Open Companion/ })
    .first()
    .click();
  await page.getByRole('heading', { level: 1, name: 'Companion' }).waitFor();
}

export const boothDrivers: Record<string, Driver> = {
  setup: (page) => readyToRecord(page),
  refusal: async (page) => {
    await openBooth(page);
    await page.getByText('Experimental: switched off in Settings.').waitFor();
    await page.getByRole('button', { name: /^Resume at ¶/ }).waitFor();
  },
  recording: (page) => startTake(page),
  'leave-dialog': async (page) => {
    await startTake(page);
    await page.keyboard.press('Escape');
    const question = page.getByRole('alertdialog', { name: 'Stop recording?' });
    await question.waitFor();
    // The way to stay is named as the mock names it, not "Cancel".
    await question.getByRole('button', { name: 'Keep recording' }).waitFor();
  },
  'roll-confirm': async (page) => {
    await startTake(page, '?mockRollReplaces=1');
    await page.keyboard.press('r');
    await page.getByRole('alertdialog', { name: /^Roll again from ¶ \d+\?$/ }).waitFor();
  },
  resume: async (page) => {
    await readyToRecord(page);
    await page.getByRole('button', { name: /^Resume at ¶/ }).click();
    await page.getByText(/¶ 14 of 24/).waitFor();
  },
  'levels-menu': async (page) => {
    await readyToRecord(page);
    await page.getByRole('button', { name: 'Levels' }).click();
    await page.getByText('Chosen in REAPER').waitFor();
  },
  'text-popover': async (page) => {
    await readyToRecord(page);
    await page.getByRole('button', { name: 'Text settings' }).click();
    await page.getByRole('slider', { name: 'Size' }).waitFor();
  },
  // A word marked on the Script with a note, then clicked in the Booth: the note under its paragraph and the side panel's Reference.
  'marked-note': async (page) => {
    await page.goto(`/${RECORD_ON}`);
    await settlePage(page);
    await goToPage(page, 'Script');
    await selectReaderWord(page, 'tired');
    await page.getByRole('toolbar', { name: 'Selection tools' }).getByRole('button', { name: 'Mark', exact: true }).click();
    await page.getByRole('menuitem').first().click();
    const composer = page.getByRole('dialog');
    await composer.getByRole('textbox').fill('Lean on it: she is bored, not sleepy.');
    await composer.getByRole('button', { name: 'Save' }).click();
    await composer.waitFor({ state: 'detached' });
    // The Script's "Marked …" toast would otherwise sit over the Booth's footer.
    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await goToPage(page, 'Booth');
    await page.getByRole('button', { name: /^Resume at ¶/ }).waitFor();
    await page.locator('[data-booth-text] [data-word][title]', { hasText: 'tired' }).click();
    await page.locator('#booth-reference').getByText('Lean on it: she is bored, not sleepy.').waitFor();
  },
  // B on the word being read: the ribbon in the margin beside its line (the toast is dismissed so the shot shows the margin).
  'bookmarks-ribbon': async (page) => {
    await readyToRecord(page);
    await page.keyboard.press('b');
    await page.locator('[data-bmk-margin] [data-bm]').first().waitFor();
    await page.getByText('Bookmark added.').waitFor();
  },
  // Pickups' "Open in Booth at this line": the Booth in a pickup session, the line listed in the side panel and marked in the text.
  'pickup-session': async (page) => {
    await page.goto(`/${RECORD_ON}`);
    await settlePage(page);
    await goToPage(page, 'Pickups');
    await page.getByRole('region', { name: 'Pickups' }).getByRole('button', { name: 'Open in Booth at this line' }).first().click();
    await page.getByRole('button', { name: /^Record$/ }).waitFor();
    await page
      .getByText(/^Pickups · \d+ open$/)
      .first()
      .waitFor();
    await page.locator('[data-booth-text] [data-pickup]').first().waitFor();
  },
  'credits-unresolved': async (page) => {
    await page.goto(`/booth${RECORD_ON}&credits=closing`);
    await settlePage(page);
    await page.getByRole('button', { name: /Fill them in Settings$/ }).waitFor();
  },
  // The Booth in the Dark theme, chosen the way a narrator chooses it (Settings' Appearance panel). If the Booth ever forced one
  // palette again, this would render the same as 'setup' and the suite's identical-states check would fail the run.
  dark: async (page) => {
    await page.goto(`/${RECORD_ON}`);
    await settlePage(page);
    await chooseTheme(page, 'Dark');
    await goToPage(page, 'Booth');
    await page.getByRole('button', { name: /^Resume at ¶/ }).waitFor();
    await record(page).and(page.locator(':enabled')).waitFor();
  },
  'companion-default': async (page) => {
    await openCompanion(page);
  },
  'companion-listening': async (page) => {
    await openCompanion(page, '?mockTeleprompter=listening&mockDawPlayhead=134.6');
    await page.getByText('Playhead 2:14.6').waitFor();
    await page.locator(LISTENING_WORD).waitFor();
  },
};
