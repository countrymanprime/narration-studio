// The helpers the page drivers (drivers/<page>.ts) share: navigation, waits and the steps more than one state takes.
import type { Locator, Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';

export type Driver = (page: Page) => Promise<void>;

// Stops every page timer (setTimeout, requestAnimationFrame) where it stands. Installed only for
// the states that need it: a fake clock left on for a whole run interferes with React 19's
// transition scheduling (the mobile nav drawer stops closing after navigation).
// The installed clock keeps running until it is paused, so on a busy page (a loaded CI runner)
// the 10 ms target can already be behind it when pauseAt runs ("Cannot fast-forward to the
// past"): read the clock again and retry rather than pause further ahead, which would fire timers.
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.install();
  for (let attempt = 1; ; attempt += 1) {
    const now = await page.evaluate(() => Date.now());
    try {
      await page.clock.pauseAt(new Date(now + 10));
      return;
    } catch (error) {
      if (attempt >= 5 || !String(error).includes('Cannot fast-forward to the past')) throw error;
    }
  }
}

// Opens the Booth (after a reload with a mock seam, when one is given) on its default chapter, Chapter 1, once the text is
// on screen.
export async function openBooth(page: Page, query = ''): Promise<void> {
  if (query) {
    await page.goto(`/${query}`);
    await settlePage(page);
  }
  await goToPage(page, 'Booth');
}

export async function clickVisible(page: Page, role: Parameters<Page['getByRole']>[0], name: string | RegExp): Promise<void> {
  // The nav rail is visible at every captured viewport except the reflow one, where only Settings states are captured
  // and they navigate through clickNav, so the click's own auto-wait is enough.
  await page
    .getByRole(role, { name, exact: typeof name === 'string' })
    .and(page.locator(':visible'))
    .first()
    .click();
}

type AppPage = 'Production' | 'Schedule' | 'Script' | 'Story Bible' | 'Booth' | 'Proof' | 'Pickups' | 'Master & QC' | 'Settings';

// Every page opens with the shared `Heading` primitive, an <h1>: it is what proves the page has arrived.
export const PAGE_HEADING: Record<AppPage, string> = {
  Production: 'Production',
  Schedule: 'Schedule',
  Script: 'Script',
  'Story Bible': 'Story Bible',
  // A visually hidden <h1>: the Booth's own status line names the chapter (benchmark mock 03).
  Booth: 'Booth',
  Proof: 'Proof',
  Pickups: 'Pickups',
  'Master & QC': 'Master & QC',
  Settings: 'Settings',
};

// The heading renders before the page's data does (chapters, the track list and the chapter estimate load after mount),
// so a page whose main content is the same in every state also gets a wait for that content. Pages left out (Story Bible,
// Settings) show different content per state, so their drivers wait for their own.
const PAGE_CONTENT: Partial<Record<AppPage, (page: Page) => Locator>> = {
  // The chapter pipeline is drawn once the production overview has answered.
  Production: (page) => page.getByRole('table', { name: 'Chapter pipeline' }),
  Script: (page) => page.locator('[data-paragraph-text]'),
  // The footer's Record control, drawn once the chapter has loaded (credits states pick theirs afterwards).
  Booth: (page) => page.getByRole('button', { name: /^(Record|Stop)$/ }),
};

// Clicks an item of the app's own navigation, and only that: the Settings category rail reuses the labels "Proof"
// and "Story Bible", so an unscoped query can land on the wrong control. The shell renders one of two navigation asides
// per width (the full sidebar from 1400 px, the icon rail below), the other is display:none, and both come before <main>
// in the DOM, so the first visible aside is the navigation.
/** Opens the Story Bible and presses Build / refresh, so the app asks to download the language model. */
export async function askForTheLanguageModel(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await settlePage(page);
  await clickNav(page, 'Story Bible');
  await page.getByRole('button', { name: 'Build / refresh Story Bible' }).click();
}

/** Opens the Story Bible on the first entry and presses its Play, so the app asks to download the local preview voice. */
export async function askForThePreviewVoice(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await settlePage(page);
  await clickNav(page, 'Story Bible');
  await page.locator('tr[data-row]').first().click();
  await page.getByRole('button', { name: 'Play preview' }).first().click();
}

// A nav item that carries a count badge is named "Proof, 14" (NavButton), so the item is found by its name and an optional count.
const navItemName = (name: string) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(, \\d+)?$`);

export async function clickNav(page: Page, name: AppPage): Promise<void> {
  // Below `md` the navigation is behind an "Open navigation" button (the reflow viewport, ADR 0061): open the drawer, pick
  // the item, and wait for the drawer to close so the page behind it is the one photographed. Only when the menu button
  // is what the layout shows, never on a timeout guess (ADR 0037).
  const menuButton = page.getByRole('button', { name: 'Open navigation' });
  if (await menuButton.isVisible()) {
    await menuButton.click();
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await drawer.getByRole('button', { name: navItemName(name) }).click();
    await drawer.waitFor({ state: 'hidden' });
    return;
  }
  await page
    .locator('aside:visible')
    .first()
    .getByRole('button', { name: navItemName(name) })
    .click();
  // Below 1360 px the rail opens over the page while the pointer is on it (ADR 0761): leave it, so it does not cover the page it just opened.
  const viewport = page.viewportSize();
  if (viewport) await page.mouse.move(viewport.width - 1, viewport.height - 1);
}

// Navigates through the nav and waits until the destination has arrived (its heading, and its content where that is the
// same in every state), so a driver can never photograph the page it just left or one still loading: a click returns as
// soon as it is dispatched, not when the next page has rendered.
export async function goToPage(page: Page, name: AppPage): Promise<void> {
  await clickNav(page, name);
  await page.getByRole('heading', { level: 1, name: PAGE_HEADING[name], exact: true }).waitFor();
  await PAGE_CONTENT[name]?.(page).first().waitFor();
}

// Proof's book level has arrived once its notes table has rows: the heading renders before the notes do.
export async function openProof(page: Page): Promise<void> {
  await goToPage(page, 'Proof');
  await waitForFindingRows(page, 4);
}

// Opens a chapter's Proof view the way a narrator does with no track linked: Proof's chapter picker, then Open chapter.
// The picker lists chapters by their full name, so the option is
// the one whose name starts with `chapterTitle` followed by the " — " subtitle separator or nothing.
export async function openProofChapter(page: Page, chapterTitle = 'Chapter 1'): Promise<void> {
  await goToPage(page, 'Proof');
  const picker = page.getByRole('combobox', { name: 'Chapter to open' });
  const label = (await picker.locator('option').allTextContents()).find((text) => text === chapterTitle || text.startsWith(`${chapterTitle} — `));
  if (!label) throw new Error(`no chapter named ${chapterTitle} in Proof's picker`);
  await picker.selectOption({ label });
  await page.getByRole('button', { name: 'Open chapter', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: `Proof · ${label}`, exact: true }).waitFor();
}

// The chapter view's compare run (the retired Proofing page's setup, run and results), scrolled into view for the picture.
export function compareRun(page: Page): Locator {
  return page.getByRole('region', { name: 'Compare the recording with the script' });
}

export async function waitForFindingRows(page: Page, count: number): Promise<void> {
  const rows = page.getByRole('table', { name: 'Notes' }).locator('tbody tr[data-row]');
  await page.waitForFunction(([expected]) => document.querySelectorAll('table[aria-label="Notes"] tbody tr[data-row]').length === expected, [count]);
  await rows.first().waitFor();
}

// The first transcript difference's detail title (WIRE_FINDINGS[0], a misread at 0:12.4).
export const MISREAD_DETAIL = '0:12.4 · Misread';

// Selects a finding by its row text and waits for its detail, a region named by its title: benchmark mock 04's "0:12.4 · Misread" for a
// note with a time, its category for one without. On the stacked layout (below `xl`) the detail sits under the list, so its
// title is scrolled into view for the picture.
export async function openFindingRow(page: Page, text: RegExp, kind: string | RegExp): Promise<void> {
  await page.getByRole('table', { name: 'Notes' }).locator('tbody tr[data-row]').filter({ hasText: text }).click();
  await page.getByRole('region', { name: kind }).waitFor();
  await page.getByRole('heading', { level: 2, name: kind }).scrollIntoViewIfNeeded();
}

// Opens the first transcript difference with the mock's REAPER in `reaper` mode (`?mockReaper=`, main.tsx; connected when absent) and
// waits for the page's first REAPER status, which is when Go to and Loop stop saying "Checking whether REAPER is connected".
export async function openReaperControls(page: Page, reaper?: 'stale' | 'not-running' | 'standalone'): Promise<void> {
  if (reaper) {
    await page.goto(`/?mockReaper=${reaper}`);
    await settlePage(page);
  }
  await openProof(page);
  await openFindingRow(page, /pink eyes/, MISREAD_DETAIL);
  await page.getByText('Checking whether REAPER is connected…').waitFor({ state: 'detached' });
}

// ReaperControls is a plain <div> (not a landmark, so two open at once - the editing check panel - stay unique to
// axe), named only by its visible "In REAPER" heading; its parent is the control group these drivers act within.
function reaperControlsGroup(page: Page): Locator {
  return page.getByRole('heading', { name: 'In REAPER' }).locator('..');
}

// Presses a REAPER button and waits for what it answers, then scrolls the REAPER controls into view for the picture.
export async function pressInReaper(page: Page, name: string, answer: Locator): Promise<void> {
  await reaperControlsGroup(page).getByRole('button', { name }).click();
  await showReaperControls(page, answer);
}

// Marks the open finding for a pickup (only an accepted finding gets an approved marker) and opens the
// Add a marker in REAPER confirm.
export async function confirmApprovedMarker(page: Page): Promise<Locator> {
  await openReaperControls(page);
  await page.getByRole('button', { name: 'Pickup', exact: true }).click();
  await page.getByText('Saved: needs a pickup.').waitFor();
  await reaperControlsGroup(page).getByRole('button', { name: 'Add marker in REAPER' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Add a marker in REAPER' });
  await dialog.waitFor();
  return dialog;
}

// Opens Master & QC (after a reload with mock seams, when given) and waits for the delivery profile and the mastering chain to
// have been read, so the page shows what it judges against and masters with.
export async function openMaster(page: Page, query = ''): Promise<void> {
  if (query) {
    await page.goto(`/${query}`);
    await settlePage(page);
  }
  await goToPage(page, 'Master & QC');
  await page.getByRole('button', { name: /^Rules and their sources/ }).waitFor();
  await page.getByRole('list', { name: 'Mastering steps' }).waitFor();
}

// Opens the Production home, with a `?mockProduction=` seed when given, once its board is drawn (the app's page at `/`).
export async function openProduction(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await settlePage(page);
  await page.getByRole('heading', { level: 1, name: PAGE_HEADING.Production, exact: true }).waitFor();
  await page.getByRole('table', { name: 'Chapter pipeline' }).waitFor();
}

// Opens Master & QC and checks the mock picker's three files (two WAVs, one of them silent, and an MP3). The mock reads a quarter
// of a file per poll, so a measurement that is not held runs to its end in a few seconds.
export async function measureOnMaster(page: Page, query = ''): Promise<void> {
  await openMaster(page, query);
  await page.getByRole('button', { name: 'Check files…' }).click();
  await page.getByRole('table', { name: 'Per-file checks' }).waitFor();
}

// Opens Master & QC's Diagnostics section, after a reload with mock seams when given, once its
// thresholds are read, and scrolls it to the top of the window: it sits below the checks and the mastering chain.
export async function openDiagnostics(page: Page, query = ''): Promise<void> {
  await openMaster(page, query);
  await page.getByRole('region', { name: 'Thresholds' }).getByText('Room-tone change').waitFor();
  await scrollToTop(page, page.getByRole('region', { name: 'Diagnostics' }));
}

// Scrolls a region to the top of the page's scroller, so a capture of the window shows it (a section below the fold).
export async function scrollToTop(page: Page, region: Locator): Promise<void> {
  await region.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
}

// Picks the mock's five files (opening/closing credits, two chapters, a retail sample) with Master & QC's "Master all to spec…"
// and assigns the three non-chapter roles the mock picker cannot infer on its own.
export async function pickFilesToMaster(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Master all to spec…' }).click();
  await page.getByRole('table', { name: 'Files to export' }).waitFor();
  await page.getByLabel('Role for 00 Opening credits.wav').selectOption('credits_opening');
  await page.getByLabel('Role for 00 Closing credits.wav').selectOption('credits_closing');
  await page.getByLabel('Role for Retail sample.wav').selectOption('retail_sample');
}

// Opens the Diagnostics tab and checks the mock picker's three files (the unheld mock reads a quarter of a file per poll).
export async function checkOnDiagnostics(page: Page, query = ''): Promise<void> {
  await openDiagnostics(page, query);
  await page.getByRole('button', { name: 'Choose files to check…' }).click();
  await page.getByRole('table', { name: 'Checked files' }).waitFor();
}

// Waits for the diagnostics check to end with `message`, then dismisses the toast its end raises (as measurementEnded does).
export async function diagnosticsEnded(page: Page, message: string | RegExp): Promise<void> {
  await page.getByRole('region', { name: 'Diagnostics' }).getByText(message).waitFor({ timeout: 15_000 });
  const dismissToast = page.getByRole('button', { name: 'Dismiss message' });
  await dismissToast.click({ timeout: 1_000 }).catch(() => undefined);
  await dismissToast.waitFor({ state: 'detached' });
}

// Waits for the measurement to end with `message` on the page (the unheld mock reads three files in twelve polls, about six
// seconds), then dismisses the toast the same end raises (job:ended, ADR 0076), which would otherwise race the screenshot.
export async function measurementEnded(page: Page, message: string | RegExp): Promise<void> {
  await page.getByRole('region', { name: 'Per-file checks' }).getByText(message).waitFor({ timeout: 15_000 });
  const dismissToast = page.getByRole('button', { name: 'Dismiss message' });
  await dismissToast.click({ timeout: 1_000 }).catch(() => undefined);
  await dismissToast.waitFor({ state: 'detached' });
}

// Opens Find pickups and duplicates once the tracks have filled the form.
export async function openScanDialog(page: Page): Promise<Locator> {
  await openProof(page);
  await page.getByRole('button', { name: 'Find pickups and duplicates…' }).click();
  const form = page.getByRole('dialog', { name: 'Find pickups and duplicates' });
  await form.getByRole('option', { name: 'Chapter 1' }).waitFor({ state: 'attached' });
  return form;
}

// Scans Chapter 1 through the dialog to its end and closes it: the mock scan saves its two groups, and the list is narrowed to
// take review.
export async function scanChapterOne(page: Page): Promise<void> {
  const form = await openScanDialog(page);
  await form.getByRole('button', { name: 'Start scan' }).click();
  const progress = page.getByRole('dialog', { name: 'Finding pickups and duplicates' });
  await progress.getByRole('status').filter({ hasText: 'Found 2 groups of repeated reads in Chapter 1.' }).waitFor();
  await progress.getByRole('button', { name: 'Close' }).click();
  await waitForFindingRows(page, 2);
  // The scan's end is also a toast (job:ended, ADR 0076) that removes itself on a real timer, which would race the screenshot:
  // dismiss it, unless a slow run already let it expire, and wait until it is gone either way.
  const dismissToast = page.getByRole('button', { name: 'Dismiss message' });
  await dismissToast.click({ timeout: 1_000 }).catch(() => undefined);
  await dismissToast.waitFor({ state: 'detached' });
}

// Scans, opens the partial pickup group and waits for its reads' REAPER controls to know REAPER is connected.
export async function openPickupGroup(page: Page): Promise<Locator> {
  await scanChapterOne(page);
  await openFindingRow(page, /Partial pickup/, /pickup$/i);
  await page.getByText('Checking whether REAPER is connected…').waitFor({ state: 'detached' });
  return page.getByRole('region', { name: 'Reads' });
}

// Compares the partial pickup group's takes through the dialog to its end and closes it: the mock saves the comparison and the
// page opens it, narrowed to take comparisons. The end's job:ended toast is dismissed, as the scan's is.
export async function compareTakes(page: Page): Promise<Locator> {
  const reads = await openPickupGroup(page);
  await reads.getByRole('button', { name: 'Compare takes…' }).click();
  const progress = page.getByRole('dialog', { name: 'Comparing takes' });
  await progress
    .getByRole('status')
    .filter({ hasText: /^Compared the takes/ })
    .waitFor();
  await progress.getByRole('button', { name: 'Close' }).click();
  const comparison = page.getByRole('region', { name: 'Takes side by side' });
  await comparison.waitFor();
  const dismissToast = page.getByRole('button', { name: 'Dismiss message' });
  await dismissToast.click({ timeout: 1_000 }).catch(() => undefined);
  await dismissToast.waitFor({ state: 'detached' });
  await page.getByText('Checking whether REAPER is connected…').waitFor({ state: 'detached' });
  return comparison;
}

export async function showReaperControls(page: Page, shown: Locator): Promise<void> {
  await shown.waitFor();
  await reaperControlsGroup(page).scrollIntoViewIfNeeded();
}

// The Production home's board exists only once its overview has been read, so it is the proof that the whole page (not just its
// heading) is there before a state that adds nothing of its own is photographed.
export async function productionLoaded(page: Page): Promise<void> {
  await PAGE_CONTENT.Production?.(page).first().waitFor();
  // A fresh page has its pointer at 0,0, on the rail, which opens over the board's first column below 1360 px (ADR 0761) and then
  // intercepts the click on a row's Chapter cell. Park the pointer mid-page.
  const viewport = page.viewportSize();
  if (viewport) await page.mouse.move(viewport.width / 2, viewport.height / 2);
}

// A chapter's row in the Production pipeline. A prefix match on the Chapter cell ("Chapter 1" and "Chapter 1 — Down the Rabbit-Hole"),
// with a word boundary so "Chapter 1" never matches "Chapter 10".
function boardRow(page: Page, chapter: string): Locator {
  return page
    .getByRole('table', { name: 'Chapter pipeline' })
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: new RegExp(`^${chapter}\\b`) }) });
}

// Opens a pipeline row's menu (the mock's row menu, useChapterTools) and picks one of its items: a right click on the row's Chapter cell.
async function rowMenu(page: Page, chapter: string, item: string): Promise<void> {
  await boardRow(page, chapter).getByRole('cell').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: item }).click();
}

// ConfirmDialog is an alertdialog (Base UI AlertDialog, ADR 0048) and every other dialog is a role="dialog". Wait for
// either, so a state driver does not care which family its dialog is in.
export function confirmDialog(page: Page, name: string | RegExp) {
  return page.getByRole('dialog', { name }).or(page.getByRole('alertdialog', { name }));
}

// Replace manuscript has one place, Settings > Global > Manuscript (SNM-2): the Production page no longer carries it.
export async function clickReplaceManuscript(page: Page): Promise<void> {
  await goToPage(page, 'Settings');
  await clickVisible(page, 'tab', 'Global');
  await clickSettingsCategory(page, 'Manuscript');
  await clickVisible(page, 'button', 'Replace manuscript');
}

// Opens the import review dialog with the mock's own preview (`?mockImportPreview=`, main.tsx): "Replace manuscript" begins the same
// select, preview and confirm flow as "Import manuscript". Returns the dialog, so a driver can work inside it.
export async function openImportReview(page: Page, preview?: 'markdown' | 'repaired' | 'text') {
  if (preview) {
    await page.goto(`/?mockImportPreview=${preview}`);
    await settlePage(page);
  }
  await clickReplaceManuscript(page);
  const extension = preview === 'markdown' ? 'md' : preview === 'text' ? 'txt' : 'docx';
  const dialog = confirmDialog(page, `Import Alice.${extension}`);
  await dialog.waitFor();
  return dialog;
}

// Opens a chapter's recording check from its Record cell on the Production board (docs/utilities/recording-coverage.md, ADR 0130), optionally booted with a mock seed (main.tsx), and waits until the stored
// result has been read into the slide-over. A chapter still recording has Record as its current stage, whose cell opens the stage
// slide-over instead: its "Recording check" button is the way on. Returns the slide-over.
export async function openRecordingCheck(page: Page, chapter: string, seed?: string) {
  if (seed) {
    await page.goto(`/?${seed}`);
    await settlePage(page);
  }
  await productionLoaded(page);
  await rowMenu(page, chapter, 'Recording check…');
  // A prefix match: the panel's full name also carries the chapter's subtitle when it has one,
  // which this helper's callers do not all pass.
  const dialog = page.getByRole('dialog', { name: new RegExp(`^Recording check: ${chapter}\\b`) });
  await dialog.getByRole('button', { name: /^Check (recording|again)$/ }).waitFor();
  await dialog.getByText('Reading the last check…').waitFor({ state: 'detached' });
  return dialog;
}

// Opens a chapter's track slide-over from its Recorded cell, booted with a mock seed
// (main.tsx's `?mockChapterLink=`), and waits for its saved-project facts to have loaded. Returns the dialog.
export async function openTrackPanel(page: Page, chapter: string, seed: string) {
  await page.goto(`/?${seed}`);
  await settlePage(page);
  await productionLoaded(page);
  await rowMenu(page, chapter, 'Chapter track…');
  // The slide-over's name carries the chapter's subtitle after " — ".
  const dialog = page.getByRole('dialog', { name: new RegExp(`^Track: ${chapter}( — |$)`) });
  await dialog.getByText('Reading the saved project…').waitFor({ state: 'detached' });
  return dialog;
}

// The Production home booted with a stage suggestions seed (`?mockStages=`, main.tsx), once the first read has answered: the chips
// above the board (`mixed`) or its error chip (`error`) are on screen.
async function openStageSuggestions(page: Page, seed: 'mixed' | 'error') {
  await page.goto(`/?mockStages=${seed}`);
  await settlePage(page);
  await productionLoaded(page);
}

// A chapter's stage slide-over on the `mixed` seed. Returns the slide-over.
export async function openStageEvidence(page: Page, chapter: string) {
  await openStageSuggestions(page, 'mixed');
  // The readiness chip on the chapter's current-stage cell opens the readiness slide-over (SN-P8; the old stage slide-over is gone).
  await boardRow(page, chapter)
    .getByRole('button', { name: /^Stage readiness: / })
    .click();
  const view = page.getByRole('dialog', { name: 'Stage readiness' });
  await view.locator('[data-verdict-pill]').waitFor();
  return view;
}

// Opens Chapter 7's editing check panel from its stage slide-over's "Editing check",
// booted with a mock seed (`?mockEditingSignal=`/`?mockEditing=`/`?mockEditingCandidates=1`, main.tsx). Unlike openStageEvidence
// this never uses the `mixed` seed: Chapter 7 is `mixed`'s own "evidence changed" demo - a query-string seed instead gives
// Chapter 7 (already in Editing status in the fixture) a plain, uncontested editing signal. Returns the panel.
export async function openEditingCheck(page: Page, query: string) {
  await page.goto(`/?${query}`);
  await settlePage(page);
  await productionLoaded(page);
  await rowMenu(page, 'Chapter 7', 'Editing check…');
  const panel = page.getByRole('dialog', { name: /^Editing check: Chapter 7\b/ });
  await panel.getByRole('button', { name: /^Check editing|Check again$/ }).waitFor();
  return panel;
}

/** Opens the engine panel from the header's engine chip, whatever state
 * the chip is in, and waits for the panel to have read its REAPER project. Returns the panel. */
export async function openEnginePanel(page: Page): Promise<Locator> {
  await page
    .locator('header')
    .getByRole('button', { name: /^REAPER: / })
    .click();
  const panel = page.getByRole('dialog', { name: 'Audio engine' });
  await panel.getByRole('region', { name: 'REAPER project' }).waitFor();
  await panel.getByRole('status').filter({ hasText: 'Looking for the REAPER project file…' }).waitFor({ state: 'detached' });
  return panel;
}

// Opens Chapter 1's editing check panel from the engine panel's Chapter links list (the editing check's second entry point), booted with a mock seed. Returns the panel.
export async function openEditingCheckFromEngine(page: Page, query: string) {
  await page.goto(`/?${query}`);
  await settlePage(page);
  await openEnginePanel(page);
  await clickVisible(page, 'button', 'Editing check…');
  const panel = page.getByRole('dialog', { name: /^Editing check: Chapter 1\b/ });
  await panel.getByRole('button', { name: /^Check editing|Check again$/ }).waitFor();
  return panel;
}

// Settings' own category rail (.settings-nav, a tab list) reuses the same labels as the
// primary app nav ("Proof", "Story Bible") - an unscoped role/name query
// matches both and .first() can silently click the wrong one (navigating
// away from Settings instead of switching category). Always scope category
// clicks to .settings-nav specifically.
export async function clickSettingsCategory(page: Page, name: string): Promise<void> {
  await page.locator('.settings-nav').getByRole('tab', { name, exact: true }).click();
}

// Settings > Story Bible with the narrator's own Merriam-Webster key saved in the mock: the panel then says Key saved.
export async function saveOnlineDictionaryKey(page: Page): Promise<void> {
  await goToPage(page, 'Settings');
  await clickVisible(page, 'tab', 'Global');
  await clickSettingsCategory(page, 'Story Bible');
  await page.getByLabel('Your key', { exact: true }).fill('0b5c1a3e-7d2f-4e6a-9c8b-2f1e0d9c8b7a');
  await clickVisible(page, 'button', 'Save key');
  await page.getByText('Key saved', { exact: true }).waitFor();
}

// Settings > Local assets, optionally booted with a mock seed (?mockAssets=): the rows are on screen once the list has loaded.
export async function openLocalAssets(page: Page, seed?: string): Promise<void> {
  if (seed) {
    await page.goto(`/?mockAssets=${seed}`);
    await settlePage(page);
  }
  await goToPage(page, 'Settings');
  await clickVisible(page, 'tab', 'Global');
  await clickSettingsCategory(page, 'Local assets');
  await page.getByRole('heading', { level: 3, name: 'Small', exact: true }).waitFor();
}

// Playwright's synthetic page.mouse.down/move/up drag doesn't reliably
// produce a non-empty window.getSelection() range for useTextSelection.ts's
// mouseup listener to pick up (unlike a real Chromium user drag, or RTL's
// fireEvent.mouseUp against a manually-constructed Range in jsdom). Building
// the Range directly and dispatching mouseup ourselves - mirroring how the
// component's own test does it - is deterministic across viewports.
export async function selectFirstParagraphText(page: Page): Promise<void> {
  // Chapter paragraphs load after the page mounts; wait for real prose, not just the container.
  await page.waitForFunction(() => [...document.querySelectorAll('[data-paragraph-text]')].some((node) => (node.textContent?.length ?? 0) >= 20));
  const selected = await page.evaluate(() => {
    // The paragraph's own firstChild is often a <mark>/<span> entity highlight, and
    // the first paragraphs can be short titles - walk every paragraph to the first
    // real Text node with enough content instead of assuming layout.
    for (const paragraph of document.querySelectorAll('[data-paragraph-text]')) {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const candidate = walker.currentNode as Text;
        if ((candidate.textContent?.length ?? 0) < 20) continue;
        const range = document.createRange();
        range.setStart(candidate, 0);
        range.setEnd(candidate, 20);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return true;
      }
    }
    return false;
  });
  if (!selected) throw new Error('no paragraph with enough text to select - did the reader markup change?');
}

/** Selects the first whole occurrence of `word` in the reader text, the way selectFirstParagraphText selects (a Range and a mouseup). */
export async function selectReaderWord(page: Page, word: string): Promise<void> {
  await page.waitForFunction(() => [...document.querySelectorAll('[data-paragraph-text]')].some((node) => (node.textContent?.length ?? 0) >= 20));
  const selected = await page.evaluate((target) => {
    const whole = new RegExp(`\\b${target}\\b`);
    for (const paragraph of document.querySelectorAll('[data-paragraph-text]')) {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const candidate = walker.currentNode as Text;
        const match = whole.exec(candidate.textContent ?? '');
        if (!match) continue;
        const range = document.createRange();
        range.setStart(candidate, match.index);
        range.setEnd(candidate, match.index + target.length);
        // A real selection is always on screen already (a narrator can only drag-select what they can see) - this
        // programmatic one is not, so it scrolls the words into view first. Without this, a chapter whose card sits
        // far enough down the page (a narrower reader card wraps its header cluster below the title, taking a second
        // row per card above it - the Script page's three columns) can select text
        // below the fold, and SelectionMenu's popup (`fixed`, placed from the selection's own viewport rect) then
        // renders off-screen too, since it does not itself scroll anything into view.
        paragraph.scrollIntoView({ block: 'center' });
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return true;
      }
    }
    return false;
  }, word);
  if (!selected) throw new Error(`no "${word}" in the reader text - did the demo manuscript change?`);
}

/** Opens the Script page (with a mock seam, when given), selects `word` and presses Look up. */
export async function lookUpInReader(page: Page, word: string, url?: string): Promise<void> {
  if (url) {
    await page.goto(url);
    await settlePage(page);
  }
  await goToPage(page, 'Script');
  await selectReaderWord(page, word);
  await clickVisible(page, 'button', 'Look up');
}

/** Links a chapter to its first available track from the engine panel's Chapter links table (the same real-UI path
 * 'chapter-link-confirmed' above uses), then follows its "Open in Proof" link and waits for its Proof chapter view to
 * render: no chapter starts linked by default in the mock; the link goes to
 * `/proof/:chapterId`). */
export async function openLinkedProofChapter(page: Page, chapterTitle: string): Promise<void> {
  await openEnginePanel(page);
  const table = page.getByRole('table', { name: 'Chapter links' });
  await table.scrollIntoViewIfNeeded();
  // An anchored-name cell match, not `hasText` (a substring): "Chapter 1" is also a substring of "Chapter 10"-"Chapter 12".
  // The cell's full name may carry the chapter's subtitle after " — ", so
  // the match allows that suffix rather than requiring an exact "Chapter 1".
  const row = table.locator('tbody tr').filter({ has: page.getByRole('cell', { name: new RegExp(`^${chapterTitle}( — |$)`) }) });
  await row.getByRole('combobox').selectOption({ index: 0 });
  await row.getByRole('button', { name: 'Confirm' }).click();
  await row.getByRole('link', { name: 'Open in Proof' }).click();
  await page.getByRole('heading', { level: 1, name: new RegExp(`^Proof · ${chapterTitle}( — |$)`) }).waitFor();
}

// Some states have no known/safe driver yet (e.g. alias-typeahead, forcing
// the manuscript-not-found banner without a mock-data override seam). Those
// are left out here on purpose - the catalog entry is simply skipped.

// Measures the mock's three files on Master & QC, then opens the 48 kHz render's sample-rate finding on Proof's notes, where the
// measurement saved it.
export async function openDeliveryFindingOnProof(page: Page): Promise<void> {
  await measureOnMaster(page);
  await measurementEnded(page, /^Measured 2 of 3 files; 1 could not be measured\./);
  await goToPage(page, 'Proof');
  await openFindingRow(page, /Sample rate 48 kHz, not 44\.1 kHz/, 'Delivery check');
}
