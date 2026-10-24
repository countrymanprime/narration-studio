// How to reach each `editing` state in STATE_CATALOG (see app.drivers.ts): the Editing page.
import { expect, type Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, openCheckingLink, clickNav, goToPage, openWithoutManuscript } from './shared';

/** Chapter 1 linked to its track, so its words carry their heard times. */
const LINKED = '?mockChapterLink=confirmed';
/** As LINKED, with the DAW's experimental edits on. */
const EDITS = `${LINKED}&mockDawExperimentalOn=1`;

export const editingDrivers: Record<string, Driver> = {
  'address-checking': async (page) => {
    await openCheckingLink(page, '/editing/gone');
  },
  // The chapters never answer, so the page's content never arrives and `goToPage` (which waits for it) is not used.
  loading: async (page) => {
    await page.goto('/?mockChapters=loading');
    await settlePage(page);
    await clickNav(page, 'Editing');
    await page.getByRole('group', { name: 'Loading the editor' }).waitFor();
  },
  // The chapters read fails: the page's error and Retry stand in for the page. `goToPage` waits for content that never comes, so it is not used.
  'load-failed': async (page) => {
    await page.goto('/?mockChapters=fails');
    await settlePage(page);
    await clickNav(page, 'Editing');
    await page.getByRole('button', { name: 'Retry' }).waitFor();
    // The failed host call also raises its own toast, which removes itself on a real timer and would race the screenshot: dismiss it.
    await page.getByRole('button', { name: 'Dismiss message' }).click();
  },
  // One chapter's read fails: the header and stepper stay and the chapter's error and Retry sit under them.
  'chapter-load-failed': async (page) => {
    await page.goto('/?mockChapterRead=fails');
    await settlePage(page);
    await clickNav(page, 'Editing');
    await page.getByRole('button', { name: 'Retry' }).waitFor();
  },
  default: async (page) => {
    await openEditing(page, LINKED);
  },
  // Issue #2251 item 30: the next flag key steps to the mock's line said twice and opens its Read twice card.
  'read-twice': async (page) => {
    await openEditing(page, LINKED);
    const card = page.locator('[data-flagcard="dup"]');
    await page.getByRole('textbox', { name: 'Script with what was heard' }).focus();
    for (let step = 0; step < 10 && (await card.count()) === 0; step++) await page.keyboard.press(']');
    await card.getByRole('button', { name: /Hear both reads/ }).waitFor();
  },
  // The menu knows the page: with nothing selected the selection actions are listed off, each with its reason.
  'jump-menu': async (page) => {
    await openEditing(page, LINKED);
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Jump menu' }).fill('selected');
    await page.getByRole('option', { name: /Delete the selected words and audio/ }).waitFor();
  },
  selection: async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
  },
  range: async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
    // Draw a range on the line's waveform that ends inside words, then zoom in once.
    const surface = page.locator('[data-ribbon-surface]');
    await surface.waitFor();
    const box = await surface.boundingBox();
    if (!box) throw new Error('The line’s waveform has no box to draw on.');
    await page.mouse.move(box.x + box.width * 0.31, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.66, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('slider', { name: 'Start of range' }).waitFor();
    const shown = page.locator('[data-view-label]');
    const before = await shown.textContent();
    await page.getByRole('region', { name: 'Waveform of the chapter' }).getByRole('button', { name: 'Zoom in' }).click();
    await expect(shown).not.toHaveText(before ?? '');
  },
  // The right button held and moved drags the waveform along; the script marks the line it now shows.
  'wave-scrolled': async (page) => {
    await openEditing(page, LINKED);
    await page.locator('[data-k="p-1:1"]').click();
    const surface = page.locator('[data-ribbon-surface]');
    await surface.waitFor();
    const box = await surface.boundingBox();
    if (!box) throw new Error('The docked waveform has no box to drag.');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.9, y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + box.width * 0.1, y, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await page.locator('[data-in-view]').first().waitFor();
    // No menu opens after a drag.
    await expect(page.getByRole('menu')).toHaveCount(0);
  },
  // A right click without a drag opens the waveform's own menu.
  'wave-menu': async (page) => {
    await openEditing(page, LINKED);
    await page.locator('[data-k="p-1:1"]').click();
    const surface = page.locator('[data-ribbon-surface]');
    await surface.waitFor();
    await surface.click({ button: 'right', position: { x: 120, y: 28 } });
    const last = page.getByRole('menuitem', { name: 'Show the whole recording' });
    await last.waitFor();
    await last.evaluate(async (el) => {
      const popup = el.closest('[role="menu"]');
      await Promise.all(popup?.getAnimations().map((a) => a.finished) ?? []);
    });
  },
  'output-popover': async (page) => {
    await openEditing(page, EDITS);
    await bar(page).getByRole('button', { name: 'Show volume and output device' }).click();
    await page.getByRole('dialog', { name: 'Output' }).waitFor();
  },
  'output-no-outputs': async (page) => {
    await openEditing(page, `${EDITS}&mockAudioOutputs=none`);
    await bar(page).getByRole('button', { name: 'Show volume and output device' }).click();
    await page.getByRole('dialog', { name: 'Output' }).getByRole('button', { name: 'Check again' }).waitFor();
  },
  'delete-dialog': async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
    await bar(page).getByRole('button', { name: 'Delete words and audio' }).click();
    await question(page, /^Delete 4 words/).waitFor();
  },
  'fx-menu': async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
    await bar(page).getByRole('button', { name: 'Add FX' }).click();
    await page
      .getByRole('menuitem', { name: /RfxChain$/ })
      .first()
      .waitFor();
    // The list of effects is a picker: the page menu's search items do not belong in it.
    if (await page.getByRole('menuitem', { name: /Jump menu|Find a page/ }).count()) throw new Error('The Add FX menu lists the page menu’s search items.');
  },
  'word-menu-fx': async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
    await page.locator('[data-k="p-1:2"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add FX' }).click();
    const chain = page.getByRole('menuitem', { name: /RfxChain$/ }).first();
    await chain.waitFor();
    // The submenu fades in: wait until it is fully drawn before the page is captured.
    await chain.evaluate(async (el) => {
      const popup = el.closest('[role="menu"]');
      await Promise.all(popup?.getAnimations().map((a) => a.finished) ?? []);
    });
  },
  'drawer-effects-inspector': async (page) => {
    // Two effects on different words, so the inspector has a neighbour either way; the first is picked.
    await openEditing(page, EDITS);
    await addEffect(page, 'p-1:1', 'p-1:4');
    await addEffect(page, 'p-2:0', 'p-2:2');
    await page.getByRole('button', { name: 'Clean up and effects' }).click();
    await page.locator('#drawer').waitFor();
    await page.getByRole('tab', { name: /^Effects/ }).click();
    await page.getByRole('button', { name: 'Next effect' }).waitFor();
    // The two "Added …" toasts cover the panel; the inspector is scrolled up under its header.
    const dismiss = page.getByRole('button', { name: 'Dismiss message' });
    while (await dismiss.count()) await dismiss.first().click();
    await page.getByRole('region', { name: 'Effect', exact: true }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  },
  'fx-dialog': async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
    await bar(page).getByRole('button', { name: 'Add FX' }).click();
    await page
      .getByRole('menuitem', { name: /RfxChain$/ })
      .first()
      .click();
    await page.locator('[role="dialog"], [role="alertdialog"]').first().waitFor();
  },
  'voice-sample-dialog': async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
    await bar(page).getByRole('button', { name: 'Voice sample' }).click();
    await page.getByRole('dialog', { name: 'Voice sample' }).waitFor();
  },
  'voice-sample-refused': async (page) => {
    await openEditing(page, EDITS);
    // The extra word at the start of the first line was heard and is not in the script: nothing there can be a sample.
    const said = page.locator('[data-k="p-1:x0"]');
    await said.click();
    await said.click({ modifiers: ['Shift'] });
    await bar(page).getByRole('button', { name: 'Voice sample' }).click();
    await page.getByRole('dialog', { name: 'Voice sample' }).getByRole('alert').waitFor();
  },
  'voice-sample-saved': async (page) => {
    await openEditing(page, EDITS);
    await selectWords(page);
    await bar(page).getByRole('button', { name: 'Voice sample' }).click();
    const dialog = page.getByRole('dialog', { name: 'Voice sample' });
    await dialog.getByRole('button', { name: 'Save sample' }).click();
    await dialog.waitFor({ state: 'hidden' });
    // The header has an Undo button of its own (the journal's), so this scopes to the toast's.
    const toast = page.getByRole('status').filter({ hasText: /^Saved voice sample for / });
    await toast.waitFor();
    await toast.getByRole('button', { name: 'Undo' }).waitFor();
  },
  'voice-sample-mark': async (page) => {
    await saveSample(page);
    await sampleDot(page).waitFor();
    // The mark is the subject: the toast that confirmed the save is dismissed so the picture differs from voice-sample-saved's.
    const toast = page.getByRole('status').filter({ hasText: /^Saved voice sample for / });
    await toast.getByRole('button', { name: 'Dismiss message' }).click();
    await toast.waitFor({ state: 'hidden' });
  },
  'voice-sample-mark-open': async (page) => {
    await saveSample(page);
    await sampleDot(page).click();
    await page.getByRole('dialog', { name: /^Voice sample: / }).waitFor();
  },
  'takes-open': async (page) => {
    await openTakes(page, EDITS);
    await expectPanelTextSize(page, 'Suggested take');
  },
  'suggestion-step': async (page) => {
    await openTakes(page, EDITS);
    await page.getByRole('button', { name: 'Normalise' }).first().click();
    await question(page, 'Normalise?').waitFor();
  },
  'drawer-cleanup': async (page) => {
    await openDrawer(page);
    await page.getByRole('region', { name: 'Clean up findings' }).waitFor();
  },
  'drawer-effects': async (page) => {
    await openDrawer(page);
    await page.getByRole('tab', { name: /^Effects/ }).click();
    await page.getByRole('region', { name: 'Effects' }).waitFor();
  },
  'drawer-effects-daw-unread': async (page) => {
    // A DAW that is not connected: the FX in the DAW section says so in place of the list (#2251 item 36).
    await openEditing(page, `${EDITS}&mockReaper=standalone`);
    await page.getByRole('button', { name: 'Clean up and effects' }).click();
    await page.locator('#drawer').waitFor();
    await page.getByRole('tab', { name: /^Effects/ }).click();
    await page
      .getByRole('region', { name: /^FX in / })
      .getByRole('alert')
      .waitFor();
  },
  'drawer-effects-chains': async (page) => {
    // With a DAW that lists its chains (the mock host's EDITS setup), the Effects tab lists them with a Favourite button on each.
    await openEditing(page, EDITS);
    await page.getByRole('button', { name: 'Clean up and effects' }).click();
    await page.locator('#drawer').waitFor();
    await page.getByRole('tab', { name: /^Effects/ }).click();
    await page
      .getByRole('button', { name: /^Favourite .*RfxChain$/ })
      .first()
      .waitFor();
  },
  'drawer-timeline': async (page) => {
    // The timeline follows the line the cursor is on: place it on the first line's second word first.
    await openEditing(page, LINKED);
    await page.locator('[data-k="p-1:1"]').click();
    // From a 1360 px window the timeline is the strip under the text (the header's Timeline button); below it, a tab of the drawer.
    if ((page.viewportSize()?.width ?? 0) >= 1360) {
      await page.getByRole('button', { name: 'Timeline', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Clean up and effects' }).click();
      await page.getByRole('tab', { name: 'Timeline' }).click();
    }
    await page.getByRole('region', { name: /^Waveform and takes/ }).waitFor();
    await expectTimelineLaidOut(page);
  },
  'never-checked': async (page) => {
    // Chapter 7 has no recorded fraction in the fixture, so it was never checked.
    await openEditing(page, LINKED);
    await page.getByRole('button', { name: /^Chapter: .*Change chapter$/ }).click();
    await page.getByRole('menuitemradio', { name: /^Chapter 7\b/ }).click();
    // Nothing was checked and the fixture leaves the chapter without a track: the script still reads, plain, and the link dialog opens over it.
    await page.getByRole('textbox', { name: 'Script with what was heard', includeHidden: true }).waitFor();
    await page.locator('#noaudio').waitFor();
  },
  // The chapter has no linked track: a dialog opens by itself once, names the chapter and offers the tracks the host found.
  unlinked: async (page) => {
    await openUnlinked(page);
    const dialog = page.getByRole('dialog', { name: /is not linked to a track/ });
    await dialog.waitFor();
    await dialog.getByRole('combobox').waitFor();
    // Nothing is boxed "not read" in a recording that is not there.
    if (await page.locator('[data-mark="miss"]').count()) throw new Error('Words are marked "not read" in a chapter with no audio.');
  },
  // The X closes it; the quiet mark stands where the banner stood and reopens it.
  'unlinked-closed': async (page) => {
    await openUnlinked(page);
    const dialog = page.getByRole('dialog', { name: /is not linked to a track/ });
    await dialog.getByRole('button', { name: 'Close' }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /Not linked to a track/ }).waitFor();
  },
  // The DAW is not answering: the dialog opens once the app has had its time to connect on its own.
  'daw-off': async (page) => {
    await openEditing(page, `${LINKED}&mockDaw=Audacity`);
    await page.getByRole('dialog', { name: /is not connected/ }).waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Check again' }).waitFor();
  },
  'daw-off-closed': async (page) => {
    await openEditing(page, `${LINKED}&mockDaw=Audacity`);
    const dialog = page.getByRole('dialog', { name: /is not connected/ });
    await dialog.waitFor({ timeout: 20_000 });
    await dialog.getByRole('button', { name: 'Close' }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /not connected/ }).waitFor();
  },
  'no-manuscript': async (page) => {
    await openWithoutManuscript(page, 'Editing');
    await page.getByRole('button', { name: 'Import manuscript' }).waitFor();
  },
};

/**
 * The drawer's Timeline tab as the mock draws it: the drawer fills the slot the layout gives it, each take's name sits on one line, and the
 * times under the lanes stay apart. A state that merely renders cannot tell the audit's cramped drawer from the right one, so this fails the row.
 */
async function expectTimelineLaidOut(page: Page): Promise<void> {
  await page.locator('#timeline [data-lane^="t"]').first().waitFor();
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const slot = document.querySelector<HTMLElement>('[data-drawer-slot]');
    const drawer = document.querySelector<HTMLElement>('#drawer');
    if (slot && drawer && Math.abs(slot.getBoundingClientRect().width - drawer.getBoundingClientRect().width) > 1)
      out.push('the drawer does not fill its slot');
    for (const lane of document.querySelectorAll<HTMLElement>('#timeline [data-lane^="t"]')) {
      const name = lane.querySelector<HTMLElement>('span');
      if (!name) continue;
      const line = parseFloat(getComputedStyle(name).lineHeight) || 16;
      if (name.getBoundingClientRect().height > line * 1.5) out.push(`"${name.textContent}" wraps`);
      if (name.scrollWidth > name.clientWidth + 1) out.push(`"${name.textContent}" is clipped`);
    }
    const ticks = [...document.querySelectorAll<HTMLElement>('#timeline [aria-hidden="true"] > span')].map((t) => t.getBoundingClientRect());
    ticks.slice(1).forEach((box, i) => box.left < ticks[i].right + 4 && out.push('the time marks run together'));
    return out;
  });
  if (bad.length) throw new Error(`The timeline drawer is cramped: ${[...new Set(bad)].join('; ')}.`);
}

/**
 * A panel under a line is UI text (the mock's `.sx-tkw` is 13 px), not the reader's script size it sits inside. Fails the row when its text
 * is larger than body text, which a render that merely looks plausible would not.
 */
async function expectPanelTextSize(page: Page, region: string): Promise<void> {
  const sizes = await page
    .getByRole('region', { name: region })
    .first()
    .evaluate((card) => [card, ...card.querySelectorAll('*')].map((el) => parseFloat(getComputedStyle(el).fontSize)));
  const largest = Math.max(...sizes);
  if (largest > 16) throw new Error(`The ${region.toLowerCase()} card draws text at ${largest}px: it inherits the script's reading size instead of the UI's.`);
}

/** A question the overlay asks, by its title (a confirm is an alertdialog, a form a dialog). */
const question = (page: Page, title: string | RegExp) => page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: title }).first();

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Playback and selection' });

/** Loads `query` and opens Editing from the rail on the first chapter, its script read. */
/** Saves a voice sample from the four selected words, as the narrator would, and waits for the dialog to close. */
async function saveSample(page: Page): Promise<void> {
  await openEditing(page, EDITS);
  await selectWords(page);
  await bar(page).getByRole('button', { name: 'Voice sample' }).click();
  const dialog = page.getByRole('dialog', { name: 'Voice sample' });
  await dialog.getByRole('button', { name: 'Save sample' }).click();
  await dialog.waitFor({ state: 'hidden' });
}

/** The dot after the last word of the range just saved. */
const sampleDot = (page: Page) => page.getByRole('button', { name: /^Voice sample: .*Press Enter for details$/ }).first();

async function openEditing(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await settlePage(page);
  await goToPage(page, 'Editing');
  await page.getByRole('textbox', { name: 'Script with what was heard' }).waitFor();
  await page.locator('[data-tchip]').first().waitFor();
}

/** Editing on Chapter 1 with no track linked. The link dialog opens by itself and hides the page from the accessibility tree, so the page's heading is not waited for. */
async function openUnlinked(page: Page): Promise<void> {
  await page.goto('/?mockChapterLink=none');
  await settlePage(page);
  await clickNav(page, 'Editing');
  await page.getByRole('textbox', { name: 'Script with what was heard', includeHidden: true }).waitFor();
  await page.locator('#noaudio').waitFor();
}

/** Selects the second to the fifth word of the first line: a click, then a Shift+click. */
/** Selects the words from `from` to `to` and puts the first listed chain on them through the question. */
async function addEffect(page: Page, from: string, to: string): Promise<void> {
  await page.locator(`[data-k="${from}"]`).click();
  await page.locator(`[data-k="${to}"]`).click({ modifiers: ['Shift'] });
  await bar(page).getByRole('button', { name: 'Add FX' }).click();
  await page
    .getByRole('menuitem', { name: /RfxChain$/ })
    .first()
    .click();
  const question = page.getByRole('dialog', { name: /^Add FX to / });
  await question.getByRole('button', { name: /^(Split and add effect|Add anyway)$/ }).click();
  await question.waitFor({ state: 'hidden' });
}

async function selectWords(page: Page): Promise<void> {
  await page.locator('[data-k="p-1:1"]').click();
  await page.locator('[data-k="p-1:4"]').click({ modifiers: ['Shift'] });
  await bar(page).getByText('4 words').waitFor();
}

/** Opens the first line's takes under it and scrolls them into view. */
async function openTakes(page: Page, query: string): Promise<void> {
  await openEditing(page, query);
  await page.locator('[data-tchip]').first().click();
  const takes = page.getByRole('region', { name: 'Suggested take' }).first();
  await takes.waitFor();
  await takes.scrollIntoViewIfNeeded();
}

/** Opens the drawer from the header (it starts on Clean up). */
async function openDrawer(page: Page): Promise<void> {
  await openEditing(page, LINKED);
  await page.getByRole('button', { name: 'Clean up and effects' }).click();
  await page.locator('#drawer').waitFor();
}
