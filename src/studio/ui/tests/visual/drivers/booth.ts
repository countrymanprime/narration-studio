// How to reach each `booth` state in STATE_CATALOG (see app.drivers.ts): the Booth page, reached through the nav as a narrator would.
// It opens on Chapter 1 (the mock's last chapter read) unless a state picks otherwise. The Companion rows open `/companion`.
import type { Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, chooseMicrophone, openCheckingLink, chooseTheme, clickNav, goToPage, openBooth, selectReaderWord, openWithoutManuscript } from './shared';

// The record capability on, so Record is enabled (the mock's REAPER keeps it switched off by default, which is the refusal row).
const RECORD_ON = '?mockRecordCapabilityOn=1';
// Where the page clock stops once Record is pressed, so the timer reads 00:00 at every viewport.
const REC_START = new Date('2026-09-28T10:00:00Z').getTime();
// The seams boot a session already 30 words into the first paragraph (word 35 of the chapter). Wait for the highlight to
// land there so the shot is never taken mid-walk.
const LISTENING_WORD = '[data-word="32"] [data-highlight="Cursor"]';

// The record capability on and the project's voice samples saved (api/voiceSamplesMock.ts).
const SAMPLES = `${RECORD_ON}&mockVoiceSamples=bible`;

const record = (page: Page) => page.getByRole('button', { name: /^Record$/ });
// Record while it cannot start: off (`aria-disabled`) but pressable, and behind a dialog once one opens.
const recordOff = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
// A chapter with no linked track (REAPER's Experimental reads on, so the Booth reads the chapter's track; Record on).
const UNLINKED = '?mockDawExperimentalOn=1&mockRecordCapabilityOn=1&mockReaperState=no_link';

// Record switched off is a chip; a press of Record opens the dialog that turns it on.
async function turnOnRecord(page: Page): Promise<void> {
  await recordOff(page).click({ force: true });
  await page
    .getByRole('dialog', { name: /^Recording in .* is experimental$/ })
    .getByRole('button', { name: 'Turn on Record' })
    .click();
}

async function readyToRecord(page: Page, query = RECORD_ON): Promise<void> {
  await openBooth(page, query);
  await page.getByRole('button', { name: /^Resume at ¶/, includeHidden: true }).waitFor();
  await record(page).and(page.locator(':enabled:not([aria-disabled="true"])')).waitFor();
}

// A take running on a paused clock; focus leaves Stop, so the page's own keys (Escape, R) reach the page as they do once the
// narrator reads on.
async function startTake(page: Page, query = RECORD_ON): Promise<void> {
  await readyToRecord(page, query);
  if (query.includes('mockEngine=builtin')) await chooseMicrophone(page);
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

// The Booth's chapters read with a seam, opened through the rail: the page's content never arrives (`loading`), so `goToPage` is not used.
async function openBoothReading(page: Page, seam: 'loading' | 'fails'): Promise<void> {
  await page.goto(`/?mockChapters=${seam}`);
  await settlePage(page);
  await clickNav(page, 'Booth');
}

export const boothDrivers: Record<string, Driver> = {
  'address-checking': async (page) => {
    await openCheckingLink(page, '/booth?chapter=gone');
  },
  loading: async (page) => {
    await openBoothReading(page, 'loading');
    await page.getByRole('group', { name: 'Loading the Booth' }).waitFor();
  },
  'companion-loading': async (page) => {
    await openCompanion(page, '?mockChapters=loading');
    await page.getByRole('group', { name: 'Loading the Companion' }).waitFor();
  },
  'load-failed': async (page) => {
    await openBoothReading(page, 'fails');
    await page.locator('p[role="alert"]', { hasText: 'The manuscript could not be read from this project.' }).waitFor();
    await page.getByRole('button', { name: 'Retry' }).waitFor();
    await page.getByRole('button', { name: 'Leave the Booth' }).waitFor();
    // The failed host call also raises its own toast, which removes itself on a real timer and would race the screenshot: dismiss it.
    await page.getByRole('button', { name: 'Dismiss message' }).click();
  },
  setup: (page) => readyToRecord(page),
  'daw-not-linked': async (page) => {
    await openBooth(page, '?mockDawChoice=found');
    const chip = page.getByRole('button', { name: 'Recording setup: REAPER, not linked' });
    await chip.hover();
    await page
      .getByRole('tooltip')
      .getByText(/REAPER not linked/)
      .waitFor();
  },
  'daw-not-running': async (page) => {
    await openBooth(page, '?mockDawChoice=not-running');
    const chip = page.getByRole('button', { name: 'Recording setup: REAPER, not running' });
    await chip.hover();
    await page
      .getByRole('tooltip')
      .getByText(/not running/)
      .waitFor();
  },
  refusal: async (page) => {
    await openBooth(page);
    await page.getByText('Experimental: switched off in Settings.').waitFor();
    await page.getByRole('button', { name: 'Record is switched off. Show details' }).waitFor();
    await page.getByRole('button', { name: /^Resume at ¶/, includeHidden: true }).waitFor();
  },
  // The same Booth after Record was pressed: the press opens the dialog that turns Record on, and nothing records.
  'refusal-pressed': async (page) => {
    await openBooth(page);
    await page.getByRole('button', { name: /^Resume at ¶/, includeHidden: true }).waitFor();
    await recordOff(page).click({ force: true });
    await page.getByRole('dialog', { name: 'Recording in REAPER is experimental' }).getByRole('button', { name: 'Turn on Record' }).waitFor();
  },
  // A chapter with no track: the link dialog opens by itself, with the project's tracks to choose from and the offer to create one.
  'record-unlinked': async (page) => {
    await openBooth(page, UNLINKED);
    const dialog = page.getByRole('dialog', { name: /is not linked to a track$/ });
    await dialog.getByRole('combobox', { name: /^Track for / }).waitFor();
    await dialog.getByRole('button', { name: 'Create a new track' }).waitFor();
  },
  // Closed with its X: the chip above the footer and the footer's sentence say what Record waits for; a press of Record reopens the dialog.
  'record-unlinked-closed': async (page) => {
    await openBooth(page, UNLINKED);
    const dialog = page.getByRole('dialog', { name: /is not linked to a track$/ });
    await dialog.getByRole('button', { name: 'Create a new track' }).waitFor();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.locator('#brec-link').getByRole('button', { name: 'Not linked to a track. Show details' }).waitFor();
    await page
      .locator('#brec-why')
      .getByText(/has no track to record on/)
      .waitFor();
  },
  // Create a new track: REAPER adds one named after the chapter and it is linked; the message says so and Record is ready.
  'record-unlinked-created': async (page) => {
    await openBooth(page, UNLINKED);
    const dialog = page.getByRole('dialog', { name: /is not linked to a track$/ });
    await dialog.getByRole('button', { name: 'Create a new track' }).click();
    await dialog.waitFor({ state: 'detached' });
    await page
      .getByRole('status')
      .getByText(/added in REAPER and linked to/)
      .first()
      .waitFor();
    await record(page).and(page.locator(':enabled:not([aria-disabled="true"])')).waitFor();
  },
  'record-connect': async (page) => {
    await openBooth(page, '?mockDawConnected=0&mockRecordCapabilityOn=1');
    // The bridge is down and the project is not linked: the dialog opens by itself, with the launcher steps and Open in REAPER (off until a file is linked).
    await page.getByRole('dialog', { name: /is not connected/ }).waitFor();
    await page.getByRole('button', { name: 'Open in REAPER and connect' }).waitFor();
  },
  // The same with the dialog closed by its X: the quiet mark stands above the footer and reopens it.
  'record-connect-closed': async (page) => {
    await openBooth(page, '?mockDawConnected=0&mockRecordCapabilityOn=1');
    const dialog = page.getByRole('dialog', { name: /is not connected/ });
    await dialog.getByRole('button', { name: 'Close' }).click();
    await dialog.waitFor({ state: 'detached' });
    await page
      .locator('#brec-setup')
      .getByRole('button', { name: /REAPER not connected/ })
      .waitFor();
  },
  'record-turned-away': async (page) => {
    await openBooth(page, '?mockDaw=busy');
    const notice = page.locator('#brec-setup');
    await turnOnRecord(page);
    const connect = page.getByRole('dialog', { name: /is not connected/ });
    await connect.getByRole('button', { name: 'Link in Settings' }).click();
    await page.getByRole('button', { name: /^Link Alice\.rpp/ }).click();
    await goToPage(page, 'Booth');
    await notice.getByRole('button').click();
    await connect.getByRole('button', { name: 'Open in REAPER and connect' }).click();
    await connect.getByRole('alert').waitFor();
    // The app waits ten seconds for the bridge with the button busy (dimmed); the state is the settled dialog, with the button offered again.
    await connect.locator('button:not([aria-busy])', { hasText: 'Open in REAPER and connect' }).waitFor({ timeout: 20_000 });
  },
  'record-other-project': async (page) => {
    await openBooth(page, '?mockDaw=different');
    const notice = page.locator('#brec-setup');
    await turnOnRecord(page);
    const connect = page.getByRole('dialog', { name: /is not connected/ });
    await connect.getByRole('button', { name: 'Link in Settings' }).click();
    await page.getByRole('button', { name: /^Link Alice\.rpp/ }).click();
    await goToPage(page, 'Booth');
    await notice.getByRole('button').click();
    await connect.getByRole('button', { name: 'Open in REAPER and connect' }).click();
    // It opens by itself: a take would land in the wrong project.
    const other = page.getByRole('dialog', { name: 'REAPER has a different project open' });
    await other.waitFor({ timeout: 15_000 });
    await other.getByText(/Last checked \d+ s ago/).waitFor();
  },
  // The app's own recorder: the chip names it, Record needs no track, and what stops a take is said in its own words.
  'builtin-setup': async (page) => {
    await openBooth(page, `?mockEngine=builtin&mockRecordCapabilityOn=1`);
    await page
      .getByRole('button', { name: /^Recording setup: / })
      .filter({ hasText: /Built-in/ })
      .waitFor();
    await record(page).and(page.locator(':enabled:not([aria-disabled="true"])')).waitFor();
  },
  'builtin-refusal': async (page) => {
    await openBooth(page, '?mockEngine=builtin');
    await page.getByRole('button', { name: 'Record is switched off. Show details' }).waitFor();
    await page.getByText('Experimental: switched off in Settings.').waitFor();
  },
  'builtin-recording': (page) => startTake(page, '?mockEngine=builtin&mockRecordCapabilityOn=1'),
  'builtin-take-ended': async (page) => {
    await startTake(page, '?mockEngine=builtin&mockRecordCapabilityOn=1&mockRecorder=failed');
    // The Booth hears the take on the mock DAW's next heartbeat; a stop heard before that is not the take's end.
    await page.clock.runFor(1_000);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.stopInDaw());
    // The mock DAW pushes the stopped transport on its next heartbeat, which the paused page clock holds back.
    await page.clock.runFor(1_000);
    await page
      .getByText(/kept in the project's Recordings folder/)
      .first()
      .waitFor();
    await record(page).and(page.locator(':enabled:not([aria-disabled="true"])')).waitFor();
  },
  recording: (page) => startTake(page),
  // Stopped through Stop once the start guard has passed: the take is in the history, and the message offers its Undo.
  'take-saved': async (page) => {
    await startTake(page);
    await page.clock.runFor(1_500);
    await page.getByRole('button', { name: /^Stop$/ }).click();
    await record(page).waitFor();
    await page.getByText('Take saved', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Undo' }).waitFor();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  },
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
  // The replay moves the reading position (a narrator's pace, 150 words a minute); the clock is run on thirty seconds and held so every viewport shows the same place.
  following: async (page) => {
    await readyToRecord(page);
    await page.clock.install({ time: REC_START });
    await page.clock.pauseAt(REC_START + 1_000);
    await record(page).click();
    await page.getByRole('button', { name: /^Stop$/ }).waitFor();
    await page.clock.runFor(30_000);
    await page.getByText(/^¶ [2-9] of 24/).waitFor();
    if (await page.locator('#blisten-why').count()) throw new Error('the footer says the text cannot follow during a take that follows');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  },
  'voice-samples-picker': async (page) => {
    await readyToRecord(page, SAMPLES);
    await page.locator('[data-speaker-chip]').first().click();
    await page.getByRole('combobox', { name: 'Search speakers' }).waitFor();
    await page
      .getByRole('listbox', { name: 'Speakers' })
      .getByText(/\d samples?$/)
      .first()
      .waitFor();
  },
  'voice-samples-panel': async (page) => {
    await readyToRecord(page, SAMPLES);
    await openSidePanel(page);
    const panel = page.getByRole('complementary', { name: 'Side panel' });
    await panel
      .getByRole('button', { name: /\d samples?$/ })
      .first()
      .click();
    await panel.getByRole('list', { name: /^Voice samples of / }).waitFor();
  },
  'voice-samples-recording': async (page) => {
    await startTake(page, SAMPLES);
    await openSidePanel(page);
    const panel = page.getByRole('complementary', { name: 'Side panel' });
    const control = panel.getByRole('button', { name: /^Play primary voice sample for / }).first();
    await control.waitFor();
    if ((await control.getAttribute('aria-disabled')) !== 'true') throw new Error('a voice sample can be played while a take records');
  },
  'listening-no-mic': async (page) => {
    await openBooth(page, `${RECORD_ON}&mockNoDevices=1`);
    await page.locator('#blisten-why', { hasText: 'The text cannot follow your voice: No microphone found.' }).waitFor();
    await record(page).and(page.locator(':enabled:not([aria-disabled="true"])')).waitFor();
  },
  'model-required': async (page) => {
    // No resume line here: finding where the recording ends needs the same missing model.
    await openBooth(page, `${RECORD_ON}&mockAssets=missing`);
    await record(page).and(page.locator(':enabled:not([aria-disabled="true"])')).waitFor();
    await page.clock.install({ time: REC_START });
    await page.clock.pauseAt(REC_START + 1_000);
    await record(page).click();
    // The mock host answers after its own short delays: run them, then hold the clock so the timer behind the question stays put.
    await page.clock.runFor(2_000);
    await page.getByRole('alertdialog', { name: /^Download local \w+ model\?$/ }).waitFor();
  },
  resume: async (page) => {
    await readyToRecord(page);
    await page.getByRole('button', { name: /^Resume at ¶/ }).click();
    await page.getByText(/¶ 14 of 24/).waitFor();
  },
  'levels-menu': async (page) => {
    await readyToRecord(page);
    await page.getByRole('button', { name: 'Levels' }).click();
    const menu = page.getByRole('dialog', { name: 'Levels' });
    await menu.getByText('Chosen in REAPER').waitFor();
    // The microphone the DAW records from is named (the mock's first listed microphone), not left blank.
    await menu.getByText('Microphone Array (Realtek(R) Audio)').waitFor();
    // REAPER's meters only read, so they show by default with no Experimental switch (the owner's decision on #2251).
    await menu.getByText('Heard on “Chapter 1 Narration” in REAPER.').waitFor();
  },
  // The Punch part is REAPER's own pre-roll, read from REAPER and shown in measures with no switch (#2251 item 11).
  // With no track armed in REAPER, so the meters say so (#2251 item 11) and this state differs from levels-menu.
  'levels-menu-preroll': async (page) => {
    await readyToRecord(page, `${RECORD_ON}&mockDawMeters=unarmed`);
    await page.getByRole('button', { name: 'Levels' }).click();
    const menu = page.getByRole('dialog', { name: 'Levels' });
    await menu.getByText('REAPER pre-roll is off: a punch records from the word with no lead-in.').waitFor();
    await menu.getByText('No track is armed in REAPER: its input level shows once one is.').waitFor();
  },
  // Experimental DAW actions on, so the monitor slider is usable and this state differs from levels-menu.
  'levels-menu-daw-meters': async (page) => {
    await readyToRecord(page, `${RECORD_ON}&mockDawExperimentalOn=1`);
    await page.getByRole('button', { name: 'Levels' }).click();
    const menu = page.getByRole('dialog', { name: 'Levels' });
    await menu.getByText('Heard on “Chapter 1 Narration” in REAPER.').waitFor();
    await menu.getByRole('meter', { name: 'REAPER output level' }).waitFor();
  },
  'room-tone-kept': async (page) => {
    await readyToRecord(page, `${RECORD_ON}&mockRoomTone=-58.6`);
    await page.getByText('Room −58.6 dB').waitFor();
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
    await page.getByRole('button', { name: /^Resume at ¶/, includeHidden: true }).waitFor();
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
  // Ctrl+F opens the jump menu; a match under "In this chapter" moves the reading to it and tints every match in the text.
  'search-shown': async (page) => {
    await readyToRecord(page);
    await page.keyboard.press('Control+f');
    await page.getByRole('combobox', { name: 'Jump menu' }).fill('the');
    await page.getByRole('listbox', { name: 'Jump menu results' }).getByText('In this chapter', { exact: true }).waitFor();
    await page.getByRole('option', { name: /¶/ }).nth(2).click();
    await page.getByRole('combobox', { name: 'Jump menu' }).waitFor({ state: 'detached' });
    await page.locator('[data-booth-text] [data-find="current"]').first().waitFor();
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
  'credits-missing': async (page) => {
    await page.goto(`/booth${RECORD_ON}&credits=closing&mockCreditsMissing=1`);
    await settlePage(page);
    await page.getByRole('heading', { name: 'The closing credits are not set up' }).waitFor();
  },
  // The Booth in the Dark theme, chosen the way a narrator chooses it (Settings' Appearance panel). If the Booth ever forced one
  // palette again, this would render the same as 'setup' and the suite's identical-states check would fail the run.
  dark: async (page) => {
    await page.goto(`/${RECORD_ON}`);
    await settlePage(page);
    await chooseTheme(page, 'Dark');
    await goToPage(page, 'Booth');
    await page.getByRole('button', { name: /^Resume at ¶/, includeHidden: true }).waitFor();
    await record(page).and(page.locator(':enabled:not([aria-disabled="true"])')).waitFor();
  },
  'companion-default': async (page) => {
    await openCompanion(page);
  },
  'companion-listening': async (page) => {
    await openCompanion(page, '?mockTeleprompter=listening&mockDawPlayhead=134.6');
    await page.getByText('Playhead 2:14.6').waitFor();
    await page.locator(LISTENING_WORD).waitFor();
  },
  'no-manuscript': async (page) => {
    await openWithoutManuscript(page, 'Booth');
  },
};

/** The side panel is a column from 1280 px up and a drawer below it that starts closed: press its toggle when it is hidden. */
async function openSidePanel(page: Page): Promise<void> {
  if (await page.locator('#booth-side').isHidden()) await page.getByRole('button', { name: /side panel/i }).click();
  await page.locator('#booth-side').waitFor({ state: 'visible' });
}
