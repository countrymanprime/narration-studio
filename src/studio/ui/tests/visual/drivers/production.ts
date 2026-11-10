// How to reach each `production` state in STATE_CATALOG (see app.drivers.ts).
import { expect, type Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import {
  type Driver,
  clickVisible,
  confirmDialog,
  openEditingCheck,
  clickReplaceManuscript,
  openImportReview,
  openProduction,
  openRecordingCheck,
  showResult,
  openStageEvidence,
  openTrackPanel,
  productionLoaded,
} from './shared';

// The mock's own day: the `?mockProduction=` seeds are dated against it and move to the real day when the app opens, so a state that
// names a date (or counts days) reads the same on every run with the clock pinned here. The clock keeps ticking.
const MOCK_DAY = new Date(2026, 8, 26, 9, 0, 0);

const PIPELINE_ROWS = 'table[aria-label="Chapter pipeline"] tbody tr[data-chapter-id]';

async function openManyChapters(page: Page): Promise<void> {
  await page.goto('/?mockBooth=many-chapters');
  await settlePage(page);
  await page.locator(PIPELINE_ROWS).first().waitFor();
}

/** Scrolls the page (whichever element scrolls it) so the pipeline's row number `row` is near the top of the view, then waits for the window to follow. */
/** Every drawn row is ROW_PX tall, one- and two-line names alike: the window and spacer maths count on it (a row a pixel off drifts 5000 px over the book). */
async function expectFixedRowHeight(page: Page): Promise<void> {
  const heights = await page.locator(PIPELINE_ROWS).evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(5);
  for (const height of heights) expect(Math.abs(height - 52)).toBeLessThanOrEqual(1);
  expect(new Set(heights.map(Math.round)).size).toBe(1);
  // The name clamp is a real line clamp on the element that holds the text (so a name of three lines ends in an ellipsis, not a silent cut), and
  // no name is taller than its two lines.
  const names = await page.locator(`${PIPELINE_ROWS} .line-clamp-2`).evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        display: style.display,
        clamp: style.getPropertyValue('-webkit-line-clamp'),
        overflow: style.overflow,
        height: element.getBoundingClientRect().height,
      };
    }),
  );
  expect(names.length).toBe(heights.length);
  for (const name of names) {
    // The clamp is on the element that holds the text. This Chromium serialises `display: -webkit-box` as `flow-root`; a plain `block` (what a
    // stray `block` class made of it) clamps nothing, so the name was cut with no ellipsis.
    expect(name).toMatchObject({ clamp: '2', overflow: 'hidden' });
    expect(['-webkit-box', 'flow-root']).toContain(name.display);
    expect(name.height).toBeLessThanOrEqual(41);
  }
}

async function scrollPipelineTo(page: Page, row: number): Promise<void> {
  await page.evaluate((index) => {
    const table = document.querySelector('table[aria-label="Chapter pipeline"]')!;
    let scroller: Element | null = table.parentElement;
    while (
      scroller &&
      !(scroller.scrollHeight > scroller.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(scroller).overflowY) && scroller.clientHeight > 300)
    ) {
      scroller = scroller.parentElement;
    }
    if (!scroller) return;
    const body = table.querySelector('tbody')!;
    const offset = body.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = offset + index * 52 - 90;
  }, row);
  await page.waitForTimeout(400);
  await page.locator(PIPELINE_ROWS).first().waitFor();
}

/** Puts keyboard focus on the first (or, with End, the last) control of the pipeline's second row and closes the tip that opens with it. */
async function focusPipelineCell(page: Page, end: boolean): Promise<void> {
  await openProduction(page);
  const row = page.locator(PIPELINE_ROWS).nth(1);
  await row.locator('button').first().focus();
  await page.keyboard.press(end ? 'End' : 'Shift');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(row.locator('button:focus')).toHaveCount(1);
  // The pipeline is under the figures: bring the focused row to the middle of the view.
  await row.evaluate((element) => element.scrollIntoView({ block: 'center' }));
}

export const productionDrivers: Record<string, Driver> = {
  // The roving cell's focus ring at the left end of a row (beside the pinned names) and at the right end (against the scroll area's edge).
  'pipeline-cell-focus-first': (page) => focusPipelineCell(page, false),
  'pipeline-cell-focus-last': (page) => focusPipelineCell(page, true),
  // 5002 chapters: the pipeline windows its rows (#1764), so the page is ready in seconds and draws a few dozen of them. Each of these
  // states is driven afresh at every width (reloadPerViewport) and scrolls the page to the pipeline, so the capture shows its rows.
  'many-chapters': async (page) => {
    await openManyChapters(page);
    await scrollPipelineTo(page, 0);
    await expectFixedRowHeight(page);
    // A clamped name gives its whole name in a tip once the pointer has rested on it (the hover delay is about a second); the tip is closed again
    // before the capture, because a portalled popup sits outside the landmarks.
    const title = page.locator(`${PIPELINE_ROWS} [data-title]`).nth(10);
    await title.hover();
    await expect(page.getByRole('tooltip')).toHaveText(/The Rabbit Sends in a Little Bill|Chapter \d+ — /, { timeout: 4000 });
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  },
  // Titles of 10,000 characters, with no break opportunity and with spaces (?mockBooth=many-unbroken, 200 chapters so the rows are windowed): the name
  // clamp holds them in their cell (the scroll area never grows past the table's own minimum width) and their tip fits the window.
  'many-chapters-unbroken': async (page) => {
    await page.goto('/?mockBooth=many-unbroken');
    await settlePage(page);
    await page.locator(PIPELINE_ROWS).first().waitFor();
    await scrollPipelineTo(page, 0);
    await expectFixedRowHeight(page);
    const widths = await page.getByRole('group', { name: 'Chapter pipeline scroll area' }).evaluate((area) => ({
      scroll: area.scrollWidth,
      client: area.clientWidth,
      min: 45.75 * parseFloat(getComputedStyle(document.documentElement).fontSize),
    }));
    expect(widths.scroll).toBeLessThanOrEqual(Math.max(widths.client, widths.min) + 1);
    // The fifth chapter's name is the unbroken one, the seventh's the long one with spaces; each gives a tip that fits the window.
    for (const nth of [4, 6]) {
      await page
        .locator(`${PIPELINE_ROWS} [data-title]`)
        .nth(nth + 1)
        .hover();
      const tip = page.getByRole('tooltip');
      await tip.waitFor({ timeout: 4000 });
      const box = (await tip.boundingBox())!;
      expect(box.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 900) - 16);
      await page.mouse.move(0, 0);
      await expect(page.getByRole('tooltip')).toHaveCount(0);
    }
  },
  // The window moved: rows 2400 on, the spacer above holding the place of the 2400 before them.
  'many-chapters-scrolled': async (page) => {
    await openManyChapters(page);
    await scrollPipelineTo(page, 2400);
    await expect(page.locator(PIPELINE_ROWS).first()).not.toHaveAttribute('data-chapter-id', /^(credits-opening|chapter-1)$/);
    await expectFixedRowHeight(page);
  },
  // Keyboard focus on a cell of a drawn row far down the book: the ring shows on the cell.
  'many-chapters-focus': async (page) => {
    await openManyChapters(page);
    await scrollPipelineTo(page, 2400);
    // Named once: the focus scrolls the cell into view, the window follows, and a position in the list would then be another cell.
    const name = (await page.locator(`${PIPELINE_ROWS} button[data-cell]`).nth(18).getAttribute('aria-label'))!;
    const cell = page.getByRole('button', { name, exact: true });
    await cell.focus();
    await page.keyboard.press('Shift');
    // The cell's tip opens with the focus; Escape closes it (a portalled popup sits outside the landmarks) and leaves the focus where it is.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(cell).toBeFocused();
  },
  // The overview never answers, so `openProduction` (which waits for the pipeline table) is not used.
  loading: async (page) => {
    await page.goto('/?mockHold=overview');
    await settlePage(page);
    await page.getByRole('group', { name: 'Loading the production overview' }).waitFor();
    await expect(page.getByText(/\d+ chapters/)).toHaveCount(0);
  },
  'load-error': async (page) => {
    await page.goto('/?mockInvalidPayload=production');
    await settlePage(page);
    await page.getByText('This page could not be loaded').waitFor();
    await page.getByRole('button', { name: 'Retry' }).waitFor();
  },
  'no-data': async (page) => {
    await openProduction(page);
    await page.getByText('Set it on the Schedule').waitFor();
  },
  'on-pace': async (page) => {
    await page.clock.install({ time: MOCK_DAY });
    await openProduction(page, '?mockProduction=on-pace');
    await page.getByRole('timer', { name: /^Timer running on Chapter 6/ }).waitFor();
  },
  'at-risk': async (page) => {
    await page.clock.install({ time: MOCK_DAY });
    await openProduction(page, '?mockProduction=at-risk');
    await page
      .getByRole('list', { name: 'Production figures' })
      .getByText(/Sep 29/)
      .waitFor();
  },
  'recorded-linked': async (page) => {
    await openProduction(page, '?mockProduction=linked');
    const table = page.getByRole('table', { name: 'Chapter pipeline' });
    await table
      .getByRole('img', { name: /: recorded none yet(,|$)/ })
      .first()
      .waitFor();
    await table.getByRole('img', { name: /^Chapter 9\b.*: recorded no track(,|$)/ }).waitFor();
  },

  'live-updates-degraded': async (page) => {
    await page.goto('/?mockLiveDegraded=1');
    await settlePage(page);
    await page.getByText(/live updates from the desktop host could not be read/).waitFor();
  },
  'no-manuscript': async (page) => {
    await page.goto('/?mockNoManuscript=1');
    await settlePage(page);
    await page.getByRole('region', { name: 'Import your manuscript' }).getByRole('button', { name: 'Import manuscript' }).waitFor();
  },
  'daw-not-linked': async (page) => {
    // Reload with the mock's no-linked-DAW seam (see main.tsx): the header's engine chip picks it up at once.
    await page.goto('/?mockNoDaw=1');
    await settlePage(page);
    await productionLoaded(page);
  },
  'chapter-sync-consent': async (page) => {
    await page.goto('/?mockChapterSync=ask');
    await settlePage(page);
    await page.getByRole('alertdialog', { name: 'Sync chapters to tracks?' }).waitFor();
  },
  'chapter-sync-toast-undo': async (page) => {
    // The mock's `?mockChapterSync=linked` seam runs its first sync once something subscribes (see mockApi.ts),
    // which the Production board does on mount, so the toast appears without a click.
    await page.goto('/?mockChapterSync=linked');
    await settlePage(page);
    await productionLoaded(page);
    await page
      .getByRole('status')
      .getByText(/^Linked /)
      .waitFor();
    // The header has an Undo button of its own (the journal's), so this scopes to the toast's.
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).waitFor();
  },
  'chapter-track-panel-linked': async (page) => {
    const dialog = await openTrackPanel(page, 'Chapter 1', 'mockChapterLink=confirmed');
    // "Linked" also names the confirmed-at Fact row's label, so this scopes to the header's state eyebrow.
    await dialog.getByText('Linked').first().waitFor();
    await dialog.getByText('Found through').waitFor();
  },
  'chapter-track-panel-ambiguous': async (page) => {
    const dialog = await openTrackPanel(page, 'Chapter 1', 'mockChapterLink=ambiguous');
    await dialog.getByText('Linked to 2 tracks').waitFor();
  },
  'chapter-track-panel-missing': async (page) => {
    const dialog = await openTrackPanel(page, 'Chapter 1', 'mockChapterLink=missing');
    await dialog.getByText('Missing', { exact: true }).waitFor();
  },
  'chapter-track-panel-suggested': async (page) => {
    const dialog = await openTrackPanel(page, 'Chapter 1', 'mockChapterLink=none');
    await dialog.getByText(/Not linked yet/).waitFor();
    // Off, with the reason on the button: the track is only a suggestion.
    await dialog.getByRole('button', { name: /Show in REAPER/ }).waitFor();
  },
  'chapter-remove-confirm': async (page) => {
    await openTrackPanel(page, 'Chapter 1', 'mockChapterLink=confirmed');
    await clickVisible(page, 'button', 'Remove from recording…');
    await page.getByRole('alertdialog', { name: 'Remove Chapter 1 from recording?' }).waitFor();
  },
  'chapter-removed-list': async (page) => {
    await page.goto('/?mockRemoved=1');
    await settlePage(page);
    await productionLoaded(page);
    const removed = page.getByText(/Removed from recording/);
    await removed.waitFor();
    // The list's last control, so the whole list is on screen whether or not its heading already was.
    await page.getByRole('button', { name: /^Restore/ }).scrollIntoViewIfNeeded();
  },

  'manuscript-candidate-offer': async (page) => {
    // Reload with the mock's candidate boot seam (see main.tsx), like
    // project/picker-empty does for the no-project seam.
    await page.goto('/?mockManuscriptCandidate=1');
    await settlePage(page);
    await confirmDialog(page, 'Import manuscript?').waitFor();
  },
  // The "Set up the credits" dialog, reached with no
  // manuscript-candidate offer in the way (see main.tsx's ?mockCredits=setup seam).
  'credits-setup-dialog': async (page) => {
    await page.goto('/?mockCredits=setup');
    await settlePage(page);
    await page.getByRole('dialog', { name: 'Set up the credits' }).waitFor();
  },
  'credits-setup-dialog-narrator-default': async (page) => {
    await page.goto('/?mockCredits=setup-narrator-default');
    await settlePage(page);
    await page.getByRole('dialog', { name: 'Set up the credits' }).waitFor();
  },
  'credits-setup-banner': async (page) => {
    await page.goto('/?mockCredits=setup');
    await settlePage(page);
    await clickVisible(page, 'button', 'Not now');
    await page.getByText(/The credits need 3 values/).waitFor();
  },
  'import-activity-log': async (page) => {
    await clickReplaceManuscript(page);
    // The import closes itself when it finishes unless this box is cleared; this state is the finished log, so it is cleared first.
    await page.getByRole('checkbox', { name: 'Close when the import finishes' }).click();
    await clickVisible(page, 'button', 'Replace and reset');
    await page.getByText('Manuscript imported', { exact: true }).first().waitFor();
  },
  'import-confirm': async (page) => {
    // The default mock state already has a manuscript loaded, so "Import
    // manuscript" isn't visible - "Replace manuscript" drives the same
    // selectManuscript -> preview -> confirm dialog flow.
    await clickReplaceManuscript(page);
    // The progress dialog that precedes it is titled "Import manuscript"; the confirm names the file.
    await confirmDialog(page, 'Import Alice.docx').waitFor();
  },
  'import-review-collapsed': async (page) => {
    const review = await openImportReview(page);
    await review.getByRole('button', { name: /^Chapters/ }).click();
  },
  'import-review-characters': async (page) => {
    const review = await openImportReview(page);
    await review.getByRole('button', { name: /^Character suggestions/ }).click();
    await review.getByRole('switch', { name: /^The White Rabbit/ }).click();
  },
  'import-review-repaired': async (page) => {
    const review = await openImportReview(page, 'repaired');
    // The groups are an accordion: opening Repairs, the last one, closes the chapters and puts the repairs on screen.
    await review.getByRole('button', { name: /^Repairs/ }).click();
  },
  'recording-check-never': async (page) => {
    const dialog = await openRecordingCheck(page, 'Chapter 7');
    // The row's label names the chapter and its state; it is the checkbox's name, not its content.
    await dialog.getByRole('checkbox', { name: /^Chapter 7\b.*Not checked yet/ }).waitFor();
  },
  'recording-check-running': async (page) => {
    const dialog = await openRecordingCheck(page, 'Chapter 7', 'mockCoverage=hold');
    await dialog.getByRole('button', { name: 'Check 1 chapter' }).click();
    // The mock holds the run at its last transcribing step, so the percent is the same at every viewport.
    await dialog.getByRole('button', { name: 'Stop checking' }).waitFor();
  },
  // A chapter's full result in Check recordings, from its row's Show result: the dialog's one result view.
  'recording-check-complete': async (page) => {
    const dialog = await showResult(page, 'Chapter 1');
    await dialog.getByText('Passes the check').waitFor();
  },
  // A chapter that is simply unfinished states it in the summary
  // ("Recorded to paragraph N of M") rather than listing its unread end as a pickup.
  'recording-check-incomplete': async (page) => {
    const dialog = await showResult(page, 'Chapter 4');
    await dialog.getByText(/^Recorded to paragraph \d+ of \d+/).waitFor();
    await dialog.getByText('Pickups (0)').waitFor();
  },
  'recording-check-pickups': async (page) => {
    const dialog = await showResult(page, 'Chapter 4', 'mockCoverage=pickups');
    await dialog.getByText('Pickups (2)').waitFor();
    await dialog.getByText('Skipped').waitFor();
    await dialog.getByText('Read short').waitFor();
  },
  // The same result scrolled to the chapter's pickup notes row, so the row is in frame at every width.
  'recording-check-pickup-notes': async (page) => {
    const dialog = await showResult(page, 'Chapter 4', 'mockCoverage=pickups');
    const row = dialog.getByText(/^Pickup notes \(Proof\)/);
    await row.waitFor();
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  },
  'recording-check-stale': async (page) => {
    const dialog = await showResult(page, 'Chapter 4', 'mockCoverage=stale');
    await dialog.getByText('This result is out of date').waitFor();
  },
  // The model cascade's own result: both models named, and the pickups it confirmed still missing.
  'recording-check-cascade': async (page) => {
    const dialog = await showResult(page, 'Chapter 4', 'mockCoverage=cascade');
    await dialog.getByText(/passage.*re-checked with the large-v3-turbo Whisper model/).waitFor();
    await dialog.getByText('Confirmed missing by the large-v3-turbo Whisper model.').first().waitFor();
  },
  // The report dialog on a book with an amount: the form beside the live preview.
  'report-dialog': async (page) => {
    await openProduction(page, '?mockProduction=on-pace');
    await page.getByRole('button', { name: 'Export status report' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export status report' });
    await dialog.getByTitle('Preview of the report').waitFor();
    await dialog.getByRole('checkbox', { name: 'Contracted amount and effective rate' }).waitFor();
  },
  // The same dialog after Export: the written files and the folder they went to, with the open-folder button beside them.
  'report-written': async (page) => {
    await openProduction(page, '?mockProduction=on-pace');
    await page.getByRole('button', { name: 'Export status report' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export status report' });
    await dialog.getByTitle('Preview of the report').waitFor();
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    await dialog.getByText(/^Wrote production-status-.*\.html and/).waitFor();
    await dialog.getByRole('button', { name: 'Open the folder' }).waitFor();
  },
  // The open-folder button when the file manager refuses (?mockOpenFolder=fail): an error toast in the host's words with Retry, and Retry asks the host again.
  'report-open-folder-failed': async (page) => {
    await openProduction(page, '?mockProduction=on-pace&mockOpenFolder=fail');
    await page.getByRole('button', { name: 'Export status report' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export status report' });
    await dialog.getByTitle('Preview of the report').waitFor();
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    await dialog.getByRole('button', { name: 'Open the folder' }).click();
    const toast = page.getByText(/^The folder could not be opened/);
    await toast.waitFor();
    await expect(toast).toContainText('the file manager could not open the reports folder');
    expect(await page.evaluate(() => window.__NARRATION_MOCK_REPORTS__?.folderOpens)).toBe(1);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect.poll(() => page.evaluate(() => window.__NARRATION_MOCK_REPORTS__?.folderOpens)).toBe(2);
    // The second refusal raises its toast again; the picture shows it.
    await expect(page.getByText(/^The folder could not be opened/).first()).toBeVisible();
  },
  // The rules the check judges by, opened from the jump menu on Production: the last of them, the background switch, is in the picture.
  'recording-check-rules': async (page) => {
    await openProduction(page);
    await page.keyboard.press('Control+KeyK');
    await page.getByRole('combobox', { name: 'Jump menu' }).fill('Open Recording check rules');
    await page
      .getByRole('option', { name: /^Open Recording check rules/ })
      .first()
      .click();
    const background = page.getByRole('switch', { name: 'Check changed chapters in the background' });
    await background.waitFor();
    await background.evaluate((element) => element.scrollIntoView({ block: 'end' }));
  },
  'recording-check-refused': async (page) => {
    const dialog = await openRecordingCheck(page, 'Chapter 7', 'mockCoverageRefusal=unmapped');
    await dialog.getByRole('button', { name: 'Check 1 chapter' }).click();
    const alert = dialog.getByRole('alert');
    await alert.getByRole('combobox', { name: /^Track for Chapter 7/ }).waitFor();
    // Chapter 7's row is low in the list: the picture shows its refusal.
    await alert.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  },
  'recording-check-model-required': async (page) => {
    const dialog = await openRecordingCheck(page, 'Chapter 7', 'mockAssets=missing');
    await dialog.getByRole('button', { name: 'Check 1 chapter' }).click();
    await confirmDialog(page, 'Download local Whisper model?').waitFor();
  },
  // The re-check model's own missing-model gate: "Check with <first model> only" beside the download.
  'recording-check-recheck-model-required': async (page) => {
    const dialog = await openRecordingCheck(page, 'Chapter 7', 'mockCoverage=recheck-required');
    const second = dialog.getByRole('checkbox', { name: /^Look again with a larger model/ });
    if ((await second.getAttribute('aria-checked')) !== 'true') await second.click();
    await dialog.getByRole('button', { name: 'Check 1 chapter' }).click();
    const ask = confirmDialog(page, 'Download the re-check model?');
    await ask.waitFor();
    await ask.getByRole('button', { name: / only$/ }).waitFor();
  },
  // The stage board's own options, opened from the jump menu: the switch and the signals, down to the last of them.
  'stage-suggestion-options': async (page) => {
    await openProduction(page, '?mockStages=mixed');
    await page.keyboard.press('Control+KeyK');
    await page.getByRole('combobox', { name: 'Jump menu' }).fill('Open Stage suggestion options');
    await page
      .getByRole('option', { name: /^Open Stage suggestion options/ })
      .first()
      .click();
    await page.getByRole('switch', { name: 'Suggest stage advances' }).waitFor();
    await page
      .getByRole('combobox', { name: 'Rendered file: length matches the chapter (proofing)' })
      .evaluate((element) => element.scrollIntoView({ block: 'end' }));
  },
  'stage-evidence-recommended': async (page) => {
    const view = await openStageEvidence(page, 'Chapter 4');
    await view.getByRole('button', { name: 'Confirm', exact: true }).waitFor();
  },
  'stage-evidence-not-ready': async (page) => {
    const view = await openStageEvidence(page, 'Chapter 6');
    await view.getByText('Not met', { exact: true }).first().waitFor();
  },
  'stage-evidence-unknown': async (page) => {
    const view = await openStageEvidence(page, 'Chapter 5');
    await view.locator('[data-verdict-pill="notchecked"]').waitFor();
  },
  'stage-evidence-changed': async (page) => {
    const view = await openStageEvidence(page, 'Chapter 7');
    await view.getByRole('button', { name: 'Revert', exact: true }).waitFor();
  },
  'editing-check-never-checked': async (page) => {
    await openEditingCheck(page, 'mockEditingSignal=never');
  },
  'editing-check-running': async (page) => {
    const panel = await openEditingCheck(page, 'mockEditing=hold&mockEditingSignal=not-met&mockEditingCandidates=1');
    await clickVisible(page, 'button', 'Check editing');
    await panel.getByRole('progressbar', { name: 'Editing check progress' }).waitFor();
  },
  'editing-check-partial': async (page) => {
    const panel = await openEditingCheck(page, 'mockEditing=hold&mockEditingSignal=not-met&mockEditingCandidates=1');
    await clickVisible(page, 'button', 'Check editing');
    await panel.getByRole('progressbar', { name: 'Editing check progress' }).waitFor();
    // Cancel takes the place of Check editing, so a press in the double-click window after it is that click's echo and is ignored.
    await page.waitForTimeout(600);
    await clickVisible(page, 'button', 'Cancel');
    await panel.getByRole('button', { name: 'Check again' }).waitFor();
  },
  'editing-check-complete-candidates': async (page) => {
    const panel = await openEditingCheck(page, 'mockEditingCandidates=1&mockEditingSignal=not-met');
    await panel.getByText('1 empty-space candidate').waitFor();
  },
  'editing-check-complete-clean': async (page) => {
    const panel = await openEditingCheck(page, 'mockEditingSignal=met');
    await panel.getByText('Met', { exact: true }).waitFor();
  },
  'editing-check-gain-match-confirm': async (page) => {
    const panel = await openEditingCheck(page, 'mockEditingSignal=met');
    const match = panel.getByRole('button', { name: 'Match levels…' }).and(page.locator(':not([aria-disabled="true"])'));
    await match.waitFor();
    await match.click();
    await page.getByRole('alertdialog', { name: 'Match levels' }).waitFor();
  },
  'editing-check-stale': async (page) => {
    const panel = await openEditingCheck(page, 'mockEditingSignal=stale');
    await panel.getByText(/Check editing again: since the last check/).waitFor();
  },
  'editing-check-settings-unset': async (page) => {
    const panel = await openEditingCheck(page, 'mockEditingSignal=settings-unset');
    await panel.getByText(/No maximum gap is set/).waitFor();
  },
  'editing-check-unsupported': async (page) => {
    const panel = await openEditingCheck(page, 'mockEditingSignal=unsupported');
    await panel.getByText(/is not a WAV file/).waitFor();
  },
  'import-review-subtitles-off': async (page) => {
    const review = await openImportReview(page);
    // Subtitles turned off: every Word heading's second line is joined back to its title (a title wrapped onto two lines).
    await review.getByRole('checkbox', { name: 'Subtitles' }).click();
  },
  'import-review-text-subtitle': async (page) => {
    const review = await openImportReview(page, 'text');
    // A plain-text heading's second line turned off returns to the text: the row says the epigraph is read as text.
    await review.getByRole('checkbox', { name: 'Subtitles' }).click();
  },
  'import-confirm-markdown': async (page) => {
    // The mock's Markdown seam (see main.tsx): the same book as a .md file, which is the one with the heading level choice.
    await page.goto('/?mockImportPreview=markdown');
    await settlePage(page);
    await clickReplaceManuscript(page);
    await confirmDialog(page, 'Import Alice.md').waitFor();
  },
  'credits-panel': async (page) => {
    await productionLoaded(page);
    // The credits are rows of the pipeline like any chapter: the row's menu (right-click) has Credits…, which opens the template panel.
    await page.getByRole('row', { name: /Opening credits/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Credits…' }).click();
    await page.getByRole('dialog', { name: 'Opening credits' }).getByRole('link', { name: 'Open in Script' }).waitFor();
  },
  'credits-closing-not-set-up': async (page) => {
    await page.goto('/?mockCreditsMissing=1');
    await settlePage(page);
    await productionLoaded(page);
    // A kind with no template has no row: the pipeline ends at the last chapter, the opening credits still before the first.
    await page.getByRole('button', { name: /^Opening credits: Prep / }).waitFor();
    await page.getByRole('button', { name: /^Closing credits: / }).waitFor({ state: 'detached' });
    // The difference is at the foot of the pipeline, below the fold at the first viewport: show it.
    await page.getByRole('table', { name: 'Chapter pipeline' }).getByRole('row').last().scrollIntoViewIfNeeded();
  },
};
// The whole page of on-pace (catalog/shared.ts: wholePage), driven the same way.
productionDrivers['whole-page'] = productionDrivers['on-pace'];
