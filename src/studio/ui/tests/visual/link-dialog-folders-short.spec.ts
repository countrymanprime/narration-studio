import { expect, test } from '@playwright/test';

// #3748: the create dialog of a Voice folders project lists the voices a new chapter folder is made with. Many voices must not push the dialog's
// buttons off screen in a short window (#3629 sizes): the voice list scrolls inside its own capped box, the dialog stays inside the window, and
// both Create a new folder and Link folder can be reached.
const SIZES = [
  { width: 320, height: 300 },
  { width: 400, height: 360 },
  { width: 360, height: 500 },
];

for (const size of SIZES) {
  test(`the folder dialog with 60 voices keeps both buttons reachable at ${size.width}x${size.height}`, async ({ page }) => {
    await page.addInitScript(() => {
      const voices = Array.from({ length: 60 }, (_, index) => ({ name: `Voice ${index + 1} of the whole travelling cast`, checked: index % 3 !== 0 }));
      (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
        chapterCreateOptions: async () => ({ folders: true, narrator: 'Narrator', voices, extras: { name: 'Extras', checked: true } }),
      };
    });
    await page.setViewportSize(size);
    await page.goto('/booth?mockReaperState=no_link&mockVoiceFolders=1');
    const dialog = page.getByRole('dialog', { name: /is not linked to a folder$/ });
    await dialog.waitFor({ timeout: 20_000 });
    const group = dialog.getByRole('group', { name: 'Tracks in the new folder' });
    await group.waitFor();
    await expect(dialog.getByRole('button', { name: 'Link folder' })).toBeVisible();
    const create = dialog.getByRole('button', { name: 'Create a new folder' });
    await create.scrollIntoViewIfNeeded();
    await expect(create).toBeVisible();
    const measured = await page.evaluate(() => {
      const popup = document.querySelector('[role=dialog]') as HTMLElement;
      const list = popup.querySelector('[role=group] ul') as HTMLElement;
      const link = [...popup.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Link folder')?.getBoundingClientRect();
      const bounds = popup.getBoundingClientRect();
      return {
        listHeight: list.getBoundingClientRect().height,
        listScrolls: list.scrollHeight > list.clientHeight,
        overflowX: popup.scrollWidth - popup.clientWidth,
        bottom: bounds.bottom,
        top: bounds.top,
        linkBottom: link?.bottom ?? Infinity,
        innerHeight: window.innerHeight,
      };
    });
    expect(measured.listHeight, 'the list is held to its cap, not to its 60 rows').toBeLessThanOrEqual(140);
    expect(measured.listScrolls, 'the rows past the cap scroll inside the list').toBe(true);
    expect(measured.overflowX).toBeLessThanOrEqual(0);
    expect(measured.top).toBeGreaterThanOrEqual(0);
    expect(measured.bottom).toBeLessThanOrEqual(measured.innerHeight);
    expect(measured.linkBottom).toBeLessThanOrEqual(measured.innerHeight);
    // Reaching the last row by keyboard does not move the buttons off screen.
    await group.getByRole('checkbox', { name: /Voice 60 of/ }).focus();
    await expect(dialog.getByRole('button', { name: 'Link folder' })).toBeVisible();
  });
}
