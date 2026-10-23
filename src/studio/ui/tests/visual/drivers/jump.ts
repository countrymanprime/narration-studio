// Opens the jump menu from the header's button as a narrator would and narrows it to commands (a leading `>`) matching `term`.
import type { Page } from '@playwright/test';

export async function openJumpMenuOnCommands(page: Page, term: string): Promise<void> {
  await page.getByRole('button', { name: /Jump to or run/ }).click();
  await page.getByRole('combobox', { name: 'Jump menu' }).fill(`> ${term}`);
}
