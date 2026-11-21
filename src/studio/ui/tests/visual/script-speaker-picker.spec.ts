// The Script reader's speaker picker in the real page, where a unit test cannot see it (#3823): focus goes back to the chip in a window narrow
// enough to be reached through the navigation drawer, the picker stays where it opened while its list changes size, and in a window that cuts
// it short only its list scrolls.
import { expect, test, type Page } from '@playwright/test';
import { speakerChip, speakerPicker, wheelSpeakerChipTo } from './drivers/script';
import { goToPage } from './drivers/shared';
import { settlePage } from './helpers/settle';

const search = (page: Page) => page.getByRole('combobox', { name: 'Search speakers' });

/** The narrator's way in: the app's first screen, then Script through the navigation (a drawer below 860 px). */
async function openScript(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Script');
}

async function openPicker(page: Page): Promise<void> {
  await speakerChip(page).click();
  await expect(search(page)).toBeFocused();
}

for (const [width, height] of [
  [1440, 900],
  [360, 500],
  [320, 300],
] as const) {
  test(`focus goes back to the speaker chip after Escape and after a choice at ${width}x${height}`, async ({ page }) => {
    await openScript(page, width, height);
    await openPicker(page);
    await page.keyboard.press('Escape');
    await expect(speakerPicker(page)).toBeHidden();
    await expect(speakerChip(page)).toBeFocused();

    await openPicker(page);
    await page.keyboard.press('Enter');
    await expect(speakerPicker(page)).toBeHidden();
    await expect(speakerChip(page)).toHaveAttribute('data-state', 'confirmed');
    await expect(speakerChip(page)).toBeFocused();
  });
}

test('the speaker picker stays where it opened while the narrator types', async ({ page }) => {
  await openScript(page, 1440, 900);
  await wheelSpeakerChipTo(page, 'middle');
  await openPicker(page);
  const place = async () => {
    const [picker, field] = [await speakerPicker(page).boundingBox(), await search(page).boundingBox()];
    return { top: Math.round(picker!.y), bottom: Math.round(picker!.y + picker!.height), field: Math.round(field!.y) };
  };
  const opened = await place();
  // The case that moved: a chip at mid-window has less room below than the picker needs, so it opens above the chip.
  expect(opened.bottom, 'the picker opened above the chip').toBeLessThanOrEqual(Math.round((await speakerChip(page).boundingBox())!.y));

  const options = page.getByRole('option');
  const all = await options.count();
  await search(page).pressSequentially('ha');
  await expect.poll(() => options.count()).toBeLessThan(all);
  const typed = await place();
  expect({ top: typed.top, field: typed.field }, 'a shorter list leaves the search box where it was').toEqual({ top: opened.top, field: opened.field });

  await search(page).fill('');
  await expect(options).toHaveCount(all);
  expect(await place(), 'and the whole list is back where it opened').toEqual(opened);
});

const scrollers = (page: Page) =>
  speakerPicker(page).evaluate((popup) => {
    // The list's own scroll box: the nearest one around the options, which is the popover itself if the list has none.
    let list = popup.querySelector<HTMLElement>('[role="listbox"]')!;
    while (list !== popup && !['auto', 'scroll'].includes(getComputedStyle(list).overflowY)) list = list.parentElement!;
    const field = popup.querySelector('input')!.getBoundingClientRect();
    const frame = popup.getBoundingClientRect();
    return {
      popupScrolls: popup.scrollHeight > popup.clientHeight + 1,
      listScrolls: list !== popup && list.scrollHeight > list.clientHeight + 1,
      listHeight: list.clientHeight,
      fieldInView: field.top >= frame.top && field.bottom <= frame.bottom,
    };
  });

test('in a 320x300 window only the list of the speaker picker scrolls, not the popover around it (#3258)', async ({ page }) => {
  await openScript(page, 320, 300);
  await openPicker(page);
  expect(await scrollers(page)).toMatchObject({ popupScrolls: false, listScrolls: true, fieldInView: true });
});

test('in a 360x500 window the speaker picker keeps its whole list height', async ({ page }) => {
  await openScript(page, 360, 500);
  await openPicker(page);
  expect(await scrollers(page)).toEqual({ popupScrolls: false, listScrolls: true, listHeight: 240, fieldInView: true });
});

// The search box kept its height and the picker its width when the cap on its height and the popup's shrink-to-fit width met (ux review of #3847):
// the box was squeezed to 20 px at 320x300 and the picker drew 195 px wide, with its min-width resolving to nothing.
for (const [width, height, wide] of [
  [1440, 900, 270],
  [360, 500, 270],
  [320, 300, 240],
] as const) {
  test(`the speaker picker's search box is a whole box and the picker is not narrow at ${width}x${height}`, async ({ page }) => {
    await openScript(page, width, height);
    await openPicker(page);
    const { field, picker } = await speakerPicker(page).evaluate((popup) => ({
      field: popup.querySelector('input')!.getBoundingClientRect().height,
      picker: popup.firstElementChild!.getBoundingClientRect().width,
    }));
    expect(field).toBeGreaterThanOrEqual(36);
    expect(picker).toBeGreaterThanOrEqual(wide);
  });
}

// At 360x500 and 320x300 the picker covers the chip it was opened from, so the second press of a double-click lands under the pointer where a
// row may be drawn: the narrator pressed one chip once and must not have chosen a speaker.
for (const [width, height] of [
  [1440, 900],
  [360, 500],
  [320, 300],
] as const) {
  test(`a double press on the speaker chip opens the picker and chooses nobody at ${width}x${height}`, async ({ page }) => {
    await openScript(page, width, height);
    const before = await speakerChip(page).getAttribute('data-state');
    await speakerChip(page).dblclick();
    await expect(speakerPicker(page)).toBeVisible();
    await expect(speakerChip(page)).toHaveAttribute('data-state', before ?? '');
  });
}
