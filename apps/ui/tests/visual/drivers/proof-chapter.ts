// How to reach each `proof-chapter` state in STATE_CATALOG (see app.drivers.ts): Proof's chapter view.
import { settlePage } from '../helpers/settle';
import { type Page } from '@playwright/test';
import { type Driver, clickVisible, compareRun, freezeClock, openLinkedProofChapter, openProofChapter } from './shared';

export const proofChapterDrivers: Record<string, Driver> = {
  never: async (page) => {
    // Chapter 7 has no recordedFraction in the fixture (mockFixtures.ts: only chapters 1-6 do), so it reads "never checked".
    await openLinkedProofChapter(page, 'Chapter 7');
    await page.getByText(/hasn.t been checked yet/).waitFor();
  },
  stale: async (page) => {
    // ?mockCoverage=stale marks Chapter 4's check stale (main.tsx).
    await page.goto('/?mockCoverage=stale');
    await settlePage(page);
    await openLinkedProofChapter(page, 'Chapter 4');
    await page.getByText('Check stale').waitFor();
  },
  current: async (page) => {
    await openLinkedProofChapter(page, 'Chapter 1');
    await page.getByText('Check current').waitFor();
  },

  // The compare run (the retired Proofing page), on Chapter 1 opened from
  // Proof's chapter picker with no track linked, scrolled so the run fills the picture.
  'compare-setup': async (page) => {
    await openCompare(page);
  },
  'compare-setup-alt': async (page) => {
    await openCompare(page);
    await clickVisible(page, 'button', 'Large');
  },
  'compare-running': async (page) => {
    await openCompare(page);
    await clickVisible(page, 'button', 'Start comparison');
    // Mid-progress: the first step landed and the run has not finished.
    await page.getByText(/^[1-9]\d?% ·/).waitFor();
  },
  'compare-results-summary': async (page) => {
    await finishComparison(page);
    await compareRun(page).scrollIntoViewIfNeeded();
  },
  // "May have changed since comparison": reviewing the last completed
  // comparison (its mock fixture carries a baseline count of 41), whose default background check answers 42 - no
  // seam needed. Live just-finished results carry no baseline in this mock (the real host sets one at prepare_compare),
  // so this state goes through "Last narrated take" rather than a fresh run.
  'compare-results-changed-since': async (page) => {
    await openCompare(page);
    await clickVisible(page, 'button', /Last narrated take/);
    await page.getByText(/may have changed/).waitFor();
    await compareRun(page).scrollIntoViewIfNeeded();
  },
  'compare-toast': async (page) => {
    await openCompare(page);
    // Suggesting hints from the manuscript answers with a toast (adding a term answers with none), and an information toast
    // fades on a real 5 s timer: freeze timers so it cannot race the screenshot.
    await freezeClock(page);
    await clickVisible(page, 'button', 'Suggest from manuscript');
    await page.locator('[data-tone]').first().waitFor();
  },
  // The vocabulary hints box: the pills box is the input, so a half-typed draft sits
  // inline after the last pill, not in a separate row.
  'compare-hints-typing': async (page) => {
    await openCompare(page);
    const box = page.getByRole('textbox', { name: 'Add a vocabulary term' });
    await box.click();
    await box.pressSequentially('Dawnspire');
    await page.waitForFunction(() => (document.activeElement as HTMLInputElement | null)?.value === 'Dawnspire');
  },
  // Many accepted terms wrap across lines of the same box. Each typed comma commits the term before it (V5), so this types the
  // whole list at once and the last, comma-less term is committed by the trailing Enter.
  'compare-hints-many-pills': async (page) => {
    await openCompare(page);
    const box = page.getByRole('textbox', { name: 'Add a vocabulary term' });
    await box.click();
    await box.pressSequentially('Arelian, Captain Arelian, Council of Ash, Juno, Kestrel, Zephyra, Dawnspire, Zeph');
    await box.press('Enter');
    await page.getByRole('button', { name: 'Remove Zeph', exact: true }).waitFor();
  },
  // Suggested names from the Story Bible sit inside the same box as dashed pills until one is clicked (V6).
  'compare-hints-pending-suggestions': async (page) => {
    await openCompare(page);
    await clickVisible(page, 'button', 'Suggest from manuscript');
    await page.getByRole('button', { name: /^\+ / }).first().waitFor();
    // Suggest also answers with a toast, which is compare-toast's picture: dismiss it so this one shows the pills alone.
    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await page.locator('[data-tone]').waitFor({ state: 'detached' });
  },
  // Accepted and pending hints together: one candidate accepted (a solid pill), the rest still pending (dashed "+ Term").
  'compare-hints-chips': async (page) => {
    await openCompare(page);
    await clickVisible(page, 'button', 'Suggest from manuscript');
    await clickVisible(page, 'button', '+ Alice');
    await page.getByRole('button', { name: 'Remove Alice', exact: true }).waitFor();
  },
  'compare-no-daw': async (page) => {
    // The mock's no-linked-DAW seam (main.tsx): Proof is never gated, and inside the chapter view Start comparison is gated with
    // the reason as its description (its tooltip is not opened: the gating shows on the button itself).
    await openCompare(page, '/?mockNoDaw=1');
    await page.getByRole('button', { name: 'Start comparison' }).and(page.locator('[aria-disabled="true"]')).waitFor();
  },
  'preview-default': async (page) => {
    await openPanel(page, '/', page.getByRole('table', { name: 'Preview candidates' }));
  },
  'preview-computing': async (page) => {
    await openPanel(page, '/?mockPreviewCandidates=computing', page.getByRole('status').getByText('Computing suggestions…'));
  },
  'preview-no-manuscript': async (page) => {
    await openPanel(page, '/?mockPreviewCandidates=no-manuscript', page.getByText('Import a manuscript to see preview suggestions.'));
  },
  'preview-nothing-eligible': async (page) => {
    await openPanel(page, '/?mockPreviewCandidates=nothing-eligible', page.getByText(/No eligible text was found/));
  },
  'preview-shorter': async (page) => {
    await openPanel(page, '/?mockPreviewCandidates=shorter', page.getByText(/shorter than the target length/));
  },
  'preview-pinned': async (page) => {
    await openPanel(page, '/?mockPreviewCandidates=pinned', page.getByText('Pinned preview'));
  },
  'preview-pin-stale': async (page) => {
    await openPanel(page, '/?mockPreviewCandidates=pin-stale', page.getByText(/manuscript text under this pin has changed/));
  },
  'preview-warnings': async (page) => {
    await openPanel(page, '/?mockPreviewCandidates=warnings', page.getByText(/imported before chapters were classified/));
  },
  // The panel is this one chapter's own readiness, so `?mockProofingStages=mixed`'s
  // two seeded chapters (main.tsx: Chapter 9 met, Chapter 10 not_met) are opened on their own chapter view, not a shared table.
  'stage-panel-suggestions': async (page) => {
    await openPanel(page, '/?mockProofingStages=mixed', page.getByText('Suggested: Finalized'), 'Chapter 9');
  },
  'stage-panel-evidence-recommended': async (page) => {
    await openPanel(page, '/?mockProofingStages=mixed', page.getByText('Suggested: Finalized'), 'Chapter 9');
    await clickVisible(page, 'button', /^Why: /);
    await page.getByRole('dialog').waitFor();
  },
  'stage-panel-evidence-not-ready': async (page) => {
    await openPanel(page, '/?mockProofingStages=mixed', page.getByText('Not ready for Finalized'), 'Chapter 10');
    await clickVisible(page, 'button', /^Why: /);
    await page.getByRole('dialog').waitFor();
  },
  'stage-panel-evidence-unknown': async (page) => {
    await openPanel(page, '/?mockProofingSignal=unmapped-track', page.getByText(/no track linked/), 'Chapter 9');
    await clickVisible(page, 'button', /^Why: /);
    await page.getByRole('button', { name: 'Open the audio engine panel' }).waitFor();
  },
  // The rendered file section: choosing, then Measure, on an unseeded Proofing chapter (Chapter 9's own
  // delivery checks stay unknown until a render is chosen and measured, matching the mock's default).
  'render-none': async (page) => {
    await openPanel(page, '/', page.getByText('Proofing readiness'), 'Chapter 9');
    const reason = page.getByText('Choose the rendered file for this chapter.');
    await reason.waitFor();
    // The panel scrolled to its own heading above, which leaves this section - the only thing that
    // differs from render-chosen - below the fold at narrower viewports (whole-run.check.ts caught them
    // as identical captures).
    await reason.scrollIntoViewIfNeeded();
  },
  'render-chosen': async (page) => {
    await openPanel(page, '/', page.getByText('Proofing readiness'), 'Chapter 9');
    await clickVisible(page, 'button', 'Choose rendered file');
    const measure = page.getByRole('button', { name: 'Measure' });
    await measure.waitFor();
    await measure.scrollIntoViewIfNeeded();
  },
  'render-measured': async (page) => {
    await openPanel(page, '/', page.getByText('Proofing readiness'), 'Chapter 9');
    await clickVisible(page, 'button', 'Choose rendered file');
    await clickVisible(page, 'button', 'Measure');
    // Scoped to the section itself: a page-wide /Measured/ also matches a delivery check's own
    // "Measured <timestamp>" evidence line elsewhere on this same chapter's page.
    const renderedFileSection = page.getByRole('heading', { name: 'Rendered file' }).locator('xpath=..');
    const measured = renderedFileSection.getByText(/Measured/);
    await measured.waitFor();
    await measured.scrollIntoViewIfNeeded();
  },
  'render-stale': async (page) => {
    await openPanel(page, '/?mockProofingRender=chapter-9-stale', page.getByText('Proofing readiness'), 'Chapter 9');
    const stale = page.getByText(/changed since you chose it/);
    await stale.waitFor();
    await stale.scrollIntoViewIfNeeded();
  },
  // Native takes: ?mockEngine=builtin seeds the built-in recorder's default
  // three takes, all unassigned to a line, offered against Chapter 1's own paragraphs.
  'native-takes-unassigned': async (page) => {
    await page.goto('/?mockEngine=builtin');
    await settlePage(page);
    await openProofChapter(page);
    const heading = page.getByRole('heading', { name: 'Native takes' });
    await heading.waitFor();
    await heading.scrollIntoViewIfNeeded();
  },
  'native-takes-keeper': async (page) => {
    await page.goto('/?mockEngine=builtin');
    await settlePage(page);
    await openProofChapter(page);
    await assignTakeToParagraph(page, 'Take 001', 'Paragraph 1');
    await assignTakeToParagraph(page, 'Take 003', 'Paragraph 1');
    const group = page.getByRole('list', { name: 'Native takes of Paragraph 1' });
    await group.getByRole('button', { name: 'Mark keeper' }).first().click();
    const keeper = group.getByRole('button', { name: 'Keeper ✓ (undo)' });
    await keeper.waitFor();
    await keeper.scrollIntoViewIfNeeded();
  },
};

// Assigns takeName to a chapter paragraph from the Native takes panel's "Not yet assigned to a line" list.
async function assignTakeToParagraph(page: Page, takeName: string, paragraphLabel: string): Promise<void> {
  const row = page.getByText(takeName, { exact: true }).locator('xpath=..');
  await row.getByLabel(`${takeName}'s line`).selectOption({ label: paragraphLabel });
  await row.getByRole('button', { name: 'Assign' }).click();
  await page
    .getByRole('list', { name: `Native takes of ${paragraphLabel}` })
    .getByText(takeName)
    .waitFor();
}

// Opens Chapter 1's Proof view (after loading `url` for a mock seam) and scrolls its compare run into view.
async function openCompare(page: Page, url?: string): Promise<void> {
  if (url) {
    await page.goto(url);
    await settlePage(page);
  }
  await openProofChapter(page);
  // The run's top at the top of the page area: the chapter view is short since the workspace left it, and a scroll that only brings the
  // run into view lands at the foot of the page, the same picture as the Preview rows'.
  await compareRun(page).evaluate((run) => run.scrollIntoView({ block: 'start' }));
}

// Runs a comparison to the end: the mock's run takes 2.6 s, then its summary shows.
async function finishComparison(page: Page): Promise<void> {
  await openCompare(page);
  await clickVisible(page, 'button', 'Start comparison');
  await page.getByRole('button', { name: 'New comparison' }).waitFor({ timeout: 10_000 });
}

// Opens a chapter's Proof view (Chapter 1 unless chapterTitle names another) after loading `url` for a mock seam,
// waits for `ready` and scrolls it into view.
async function openPanel(page: Page, url: string, ready: ReturnType<Page['getByText']>, chapterTitle?: string): Promise<void> {
  if (url !== '/') {
    await page.goto(url);
    await settlePage(page);
  }
  await openProofChapter(page, chapterTitle);
  await ready.first().waitFor();
  await ready.first().evaluate((element) => element.scrollIntoView({ block: 'center' }));
}
