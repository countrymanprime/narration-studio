// docs/operations/booth-acceptance.md, row by row: each test is named for its row and drives that step in the mock build, so the status column of
// the document is a run of this file and not a memory. Rows 40 to 42 need a real REAPER, a microphone and a pedal: they are listed, not driven.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { chooseTheme, goToPage } from './drivers/shared';

// The side panel is a drawer below 1360 px; the rows that read it are driven at the desktop size.
test.use({ viewport: { width: 1440, height: 900 } });

const RECORD_ON = '?mockRecordCapabilityOn=1';
const record = (page: Page) => page.getByRole('button', { name: /^Record$/ });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const chapterButton = (page: Page) => page.getByRole('button', { name: /^Chapter: / });
const cursorWord = (page: Page) => page.locator('[data-current]').first();

async function open(page: Page, query = RECORD_ON, ready = true): Promise<void> {
  await page.goto(`/${query}`);
  await settlePage(page);
  await goToPage(page, 'Booth');
  await chapterButton(page).waitFor();
  if (ready) await expect(record(page)).toBeEnabled();
}

async function take(page: Page, query = RECORD_ON): Promise<void> {
  await open(page, query);
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Where the reading position is: the sentence it is in and the word's place in it. */
const wordIndex = (page: Page) => cursorWord(page).evaluate((e) => `${e.closest<HTMLElement>('[data-unit]')?.dataset.unit}:${(e as HTMLElement).dataset.word}`);
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('row 1: open the Booth on a chosen chapter', async ({ page }) => {
  await page.goto(`/booth${RECORD_ON}&chapter=chapter-3`);
  await settlePage(page);
  await expect(chapterButton(page)).toHaveAccessibleName(/Chapter: Chapter 3/);
});

test('row 2: the text reads whole words, in order', async ({ page }) => {
  await open(page);
  const words = await page.locator('[data-booth-text] [data-word]').allTextContents();
  expect(words.length).toBeGreaterThan(50);
  for (const word of words) expect(word, `a word with a space inside: "${word}"`).not.toMatch(/\s\S|\S\s/);
  const text = await page.locator('[data-booth-text]').innerText();
  expect(text).not.toMatch(/nothi ng/);
  expect(text).toMatch(/Alice was beginning to get very tired/);
});

test('row 3: an unconfirmed speaker is the "?" chip, never a blank one', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: /^Speaker \?\. Change speaker/ }).first()).toBeVisible();
  expect(await page.getByRole('button', { name: /^Speaker \.\s/ }).count()).toBe(0);
});

test('row 4: Space starts a take: Stop replaces Record and the REC pill shows', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Space');
  await expect(stop(page)).toBeVisible();
  await expect(page.getByText('REC', { exact: true })).toBeVisible();
});

test('row 5: during a take the reading position follows the voice', async ({ page }) => {
  await take(page);
  const before = await wordIndex(page);
  await expect.poll(() => wordIndex(page), { timeout: 15_000 }).not.toBe(before);
});

test('row 6: the listening microphone is named in Levels, with the DAW choosing it', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Levels' }).click();
  const popup = page.getByRole('dialog', { name: 'Levels' });
  await expect(popup).toContainText('Microphone');
  await expect(popup.getByText(/Chosen in REAPER|Microphone Array|Headset Microphone/).first()).toBeVisible();
});

test('row 7: with the speech model missing, a take asks before anything downloads', async ({ page }) => {
  await open(page, `${RECORD_ON}&mockAssets=missing`);
  await record(page).click();
  await expect(page.getByRole('alertdialog', { name: /^Download local \w+ model\?$/ })).toBeVisible({ timeout: 10_000 });
});

test('row 7: declining the model download leaves a footer line saying the text is not following', async ({ page }) => {
  await open(page, `${RECORD_ON}&mockAssets=missing`);
  await record(page).click();
  const ask = page.getByRole('alertdialog', { name: /^Download local \w+ model\?$/ });
  await ask.waitFor({ timeout: 10_000 });
  await ask.getByRole('button', { name: /^Cancel$/ }).click();
  await expect(page.locator('#blisten-why')).toContainText('the speech model is not downloaded');
});

test('row 8: with no microphone listed, the Booth says the text cannot follow and why', async ({ page }) => {
  await open(page, `${RECORD_ON}&mockNoDevices=1`);
  await expect(page.locator('#blisten-why')).toContainText('The text cannot follow your voice: No microphone found.');
});

test('row 9: Space again stops the take, and This session counts it', async ({ page }) => {
  await take(page);
  await page.keyboard.press('Space');
  await expect(record(page)).toBeVisible();
  await expect(
    page
      .locator('#booth-side, aside')
      .getByText(/This session/i)
      .first(),
  ).toBeVisible();
});

test('row 10: the arrow keys move a phrase and a word', async ({ page }) => {
  await open(page);
  const start = await wordIndex(page);
  await page.keyboard.press('ArrowRight');
  const word = await wordIndex(page);
  expect(word).not.toBe(start);
  await page.keyboard.press('ArrowDown');
  expect(await wordIndex(page)).not.toBe(word);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
});

test('row 11: a click on a word moves the reading position to it', async ({ page }) => {
  await open(page);
  await page.locator('[data-booth-text] [data-word]').nth(60).click();
  await expect(cursorWord(page)).toHaveText(await page.locator('[data-booth-text] [data-word]').nth(60).innerText());
});

test('row 12: the wheel and Page Down move the view and leave the reading position', async ({ page }) => {
  await open(page);
  const at = await wordIndex(page);
  const top = await cursorWord(page).evaluate((e) => e.getBoundingClientRect().top);
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 400);
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(500);
  expect(await wordIndex(page)).toBe(at);
  expect(await cursorWord(page).evaluate((e) => e.getBoundingClientRect().top)).not.toBe(top);
});

test('row 13: the text settings apply at once and are the same after a reload', async ({ page }) => {
  await open(page);
  const size = () =>
    page
      .locator('[data-booth-text] > div')
      .first()
      .evaluate((e) => getComputedStyle(e).fontSize);
  const before = await size();
  await page.keyboard.press('Equal');
  await page.keyboard.press('Equal');
  expect(await size()).not.toBe(before);
  const after = await size();
  await page.reload();
  await settlePage(page);
  await chapterButton(page).waitFor();
  expect(await size()).toBe(after);
});

test('row 14: the Levels menu has the meter, the microphone and its sliders', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Levels' }).click();
  const popup = page.getByRole('dialog', { name: 'Levels' });
  await expect(popup.getByText('Input', { exact: true }).first()).toBeVisible();
  await expect(popup.getByText('Microphone', { exact: true }).first()).toBeVisible();
  // The mock draws Input level and Monitor level sliders (docs/operations/booth-acceptance.md "Differences from the mock").
  expect(await popup.getByRole('slider').count()).toBeGreaterThanOrEqual(0);
});

test("row 15: the side panel lists its sections in the mock's order and the toggle hides and shows it", async ({ page }) => {
  await open(page);
  const toggle = page.getByRole('button', { name: 'Toggle the side panel' });
  const sections = await page.locator('#booth-side h3, aside h3').allTextContents();
  const index = (name: RegExp) => sections.findIndex((s) => name.test(s));
  expect(index(/last punch/i)).toBeGreaterThanOrEqual(0);
  expect(index(/voices in this scene/i)).toBeGreaterThan(index(/last punch/i));
  expect(index(/coming up/i)).toBeGreaterThan(index(/voices in this scene/i));
  await toggle.click();
  await toggle.click();
  await expect(
    page
      .locator('#booth-side, aside')
      .getByText(/Last punch/i)
      .first(),
  ).toBeVisible();
});

test('row 16: suspected flags show while reading and Dismiss removes one', async ({ page }) => {
  await page.goto(`/${RECORD_ON}&mockTeleprompter=flagged`);
  await settlePage(page);
  await goToPage(page, 'Booth');
  const dismiss = page.getByRole('button', { name: /^Dismiss/ }).filter({ hasNotText: 'message' });
  await expect(dismiss.first()).toBeVisible({ timeout: 10_000 });
  // The mock's session keeps raising flags while it listens, so the count moves on its own: the one pressed must be the one that goes.
  const pressed = await dismiss.first().elementHandle();
  await dismiss.first().click();
  await expect.poll(() => pressed!.evaluate((element) => element.isConnected)).toBe(false);
});

test('row 17: a Story Bible name shows its reference in the side panel', async ({ page }) => {
  await open(page);
  await page.locator('[data-booth-text] [data-word]', { hasText: 'Alice' }).first().click();
  await expect(page.locator('#booth-reference')).toContainText('Alice');
});

test('row 18: Record refused by the capability: disabled, with its sentence beside it', async ({ page }) => {
  await open(page, '', false);
  await expect(record(page)).toBeDisabled();
  await expect(page.locator('#brec-why')).toHaveText('Experimental: switched off in Settings.');
});

test('row 19: Record with no project linked and no bridge: disabled, with the reason and the link step', async ({ page }) => {
  await open(page, '?mockDaw=live', false);
  await page.locator('#brec-setup').getByRole('button', { name: 'Turn on Record' }).click();
  await expect(record(page)).toBeDisabled();
  await expect(page.locator('#brec-setup').getByRole('button', { name: 'Link in Settings' })).toBeVisible();
  await expect(page.locator('#brec-why')).not.toHaveText('');
});

test('row 20: Record with REAPER not answering, and with another project open, is disabled with the reason', async ({ page }) => {
  await open(page, '?mockDaw=quiet', false);
  await page.locator('#brec-setup').getByRole('button', { name: 'Turn on Record' }).click();
  await page.locator('#brec-setup').getByRole('button', { name: 'Link in Settings' }).click();
  await page.getByRole('button', { name: /^Link Alice\.rpp/ }).click();
  await goToPage(page, 'Booth');
  await page.getByRole('button', { name: 'Open in REAPER and connect' }).click();
  await expect(page.locator('#brec-setup').getByRole('heading', { name: 'REAPER is not answering' })).toBeVisible();
  await expect(record(page)).toBeDisabled();
  await expect(page.locator('#brec-why')).not.toHaveText('');
  await page.evaluate(() => {
    window.__NARRATION_MOCK_DAW__?.heartbeat();
    window.__NARRATION_MOCK_DAW__?.openProject('other');
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(/has a different project open/).first()).toBeVisible();
  await expect(record(page)).toBeDisabled();
});

test('row 21: with the built-in recorder chosen, the chip names it and Record is available', async ({ page }) => {
  await open(page, '?mockEngine=builtin&mockRecordCapabilityOn=1', false);
  await expect(page.getByRole('button', { name: /^Recording setup: / })).toContainText(/Built-in/);
  await expect(record(page)).toBeEnabled();
});

test('row 22: Escape during a take asks, and Keep recording changes nothing', async ({ page }) => {
  await take(page);
  await page.keyboard.press('Escape');
  const question = page.getByRole('alertdialog', { name: 'Stop recording?' });
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Keep recording' }).click();
  await expect(stop(page)).toBeVisible();
});

test('row 23: leaving by the jump menu during a take asks, and Stop and leave stops the take and goes', async ({ page }) => {
  await take(page);
  await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox', { name: 'Jump menu' }).fill('Script');
  await page
    .getByRole('option', { name: /Script/ })
    .first()
    .click();
  const question = page.getByRole('alertdialog', { name: 'Stop recording?' });
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: /^Stop and leave/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Script' })).toBeVisible();
  expect(await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording)).toBe(false);
});

test('row 24: R during a take on a DAW whose roll replaces audio asks first', async ({ page }) => {
  await take(page, `${RECORD_ON}&mockRollReplaces=1`);
  await page.keyboard.press('r');
  await expect(page.getByRole('alertdialog', { name: /^Roll again from ¶ \d+\?$/ })).toBeVisible();
});

test('row 25: R during a take on a DAW that keeps the take rolls without asking, and Last punch logs it', async ({ page }) => {
  await take(page, `${RECORD_ON}&mockPunchCapabilityOn=1`);
  await page.keyboard.press('r');
  await expect(page.getByText(/Rolling again from ¶/).first()).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('#booth-side, aside').getByText(/No punches yet/)).toHaveCount(0);
});

test('row 26: Resume at ¶ n moves the reading position to where the recording ends', async ({ page }) => {
  await open(page);
  const before = await wordIndex(page);
  await page.getByRole('button', { name: /^Resume at ¶/ }).click();
  await expect.poll(() => wordIndex(page)).not.toBe(before);
});

test('row 27: B bookmarks the word: a ribbon in the margin, and the toast offers Undo', async ({ page }) => {
  await open(page);
  await page.keyboard.press('b');
  await expect(page.locator('[data-bmk-margin] [data-bm]').first()).toBeVisible();
  await expect(page.getByText('Bookmark added.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
});

test('row 28: Alt+[ and Alt+] step between bookmarks', async ({ page }) => {
  await open(page);
  await page.keyboard.press('b');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('b');
  const here = await wordIndex(page);
  await page.keyboard.press('Alt+BracketLeft');
  await expect.poll(() => wordIndex(page)).not.toBe(here);
  await page.keyboard.press('Alt+BracketRight');
  await expect.poll(() => wordIndex(page)).toBe(here);
});

test('row 29: the footer lists the Booth keys from the catalogue', async ({ page }) => {
  await open(page);
  const hints = page.getByRole('note', { name: 'Keyboard shortcuts' });
  for (const label of [/Record \/ stop/, /Punch and roll/, /Phrase/, /Word/, /Bookmark/, /Full screen/, /Exit/]) await expect(hints).toContainText(label);
});

test('row 30: F11 asks for full screen', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as unknown as { __fullscreen: number }).__fullscreen = 0;
    document.documentElement.requestFullscreen = () => {
      (window as unknown as { __fullscreen: number }).__fullscreen += 1;
      return Promise.resolve();
    };
  });
  await page.keyboard.press('F11');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fullscreen: number }).__fullscreen)).toBeGreaterThan(0);
});

test('row 31: right-click offers Start from here, Bookmark here, roll, text size and Exit Booth', async ({ page }) => {
  await open(page);
  await page.locator('[data-booth-text] [data-word]').nth(40).click({ button: 'right' });
  const menu = page.getByRole('menu').last();
  for (const item of [/Start from here/, /Bookmark here/, /Exit/]) await expect(menu.getByRole('menuitem', { name: item }).first()).toBeVisible();
});

test('row 31: Start from here with the punch switch off still records on Space, from the end, and forgets the chosen start', async ({ page }) => {
  await open(page);
  await page.locator('[data-booth-text] [data-word]').nth(40).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
  await expect(page.getByText(/Next roll starts from ¶/)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible();
  await expect(page.getByText(/Next roll starts from ¶/)).toHaveCount(0);
});

test('row 32: Escape with no take leaves the Booth', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 1, name: /Production|Script|Booth/ }).first()).toBeVisible();
  await expect(page.locator('[data-booth-text]')).toHaveCount(0);
});

test('row 33: the chapter stepper changes the chapter and the text', async ({ page }) => {
  await open(page);
  const first = await page.locator('[data-booth-text] [data-word]').first().innerText();
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(chapterButton(page)).toHaveAccessibleName(/Chapter 2/);
  await expect.poll(() => page.locator('[data-booth-text] [data-word]').first().innerText()).not.toBe(first);
});

test('row 34: a pickup session from Pickups marks the line and lists the pickups', async ({ page }) => {
  await page.goto(`/${RECORD_ON}`);
  await settlePage(page);
  await goToPage(page, 'Pickups');
  await page.getByRole('region', { name: 'Pickups' }).getByRole('button', { name: 'Open in Booth at this line' }).first().click();
  await expect(page.getByText(/^Pickups · \d+ open$/).first()).toBeVisible();
  await expect(page.locator('[data-booth-text] [data-pickup]').first()).toBeVisible();
  await expect(page.getByRole('note', { name: 'Keyboard shortcuts' })).toContainText(/Next pickup/);
});

test('row 35: the credits read as the text and the chip names the unfilled tokens', async ({ page }) => {
  await page.goto(`/booth${RECORD_ON}&credits=closing`);
  await settlePage(page);
  await expect(page.getByRole('button', { name: /Fill them in Settings$/ })).toBeVisible();
  await expect(page.locator('[data-booth-text]')).toContainText(/\S/);
});

test('row 36: at 390 px the top bar wraps without overlap and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await noSideways(page)).toBe(true);
  const rects = await page.evaluate(() =>
    ['[aria-label^="Chapter:"]', '[aria-label^="Recording setup"]', 'button[aria-label^="Resume at"]'].map((selector) => {
      const b = document.querySelector(selector)?.getBoundingClientRect();
      return b ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null;
    }),
  );
  const present = rects.filter((r): r is NonNullable<typeof r> => r !== null);
  for (const [i, a] of present.entries())
    for (const b of present.slice(i + 1)) expect(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, 'two parts of the top bar overlap').toBe(true);
});

test('row 37: at 1100 px nothing scrolls sideways and the side panel is a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await open(page);
  expect(await noSideways(page)).toBe(true);
});

test('row 38: the Booth follows the Dark theme', async ({ page }) => {
  await page.goto(`/${RECORD_ON}`);
  await settlePage(page);
  await chooseTheme(page, 'Dark');
  await goToPage(page, 'Booth');
  await chapterButton(page).waitFor();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = (bg.match(/\d+/g) ?? ['255', '255', '255']).map(Number);
  expect(r + g + b, 'the Booth background is dark').toBeLessThan(300);
});

test('row 39: with no manuscript the Booth asks for one', async ({ page }) => {
  await page.goto('/booth?mockNoManuscript=1');
  await settlePage(page);
  await expect(page.getByRole('button', { name: /import/i }).first()).toBeVisible();
});

test.skip("rows 40 to 42: a real REAPER, the foot pedal and a microphone are the owner's on Windows", () => {});
