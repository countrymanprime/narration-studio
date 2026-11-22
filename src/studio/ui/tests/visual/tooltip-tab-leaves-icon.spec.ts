// Tab and Shift+Tab from a "i" hint icon move focus to the neighbouring control, not to <body> (#3995). The icon's note opens on keyboard focus, and the
// library's focus guard around it must be left to move focus on.
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';

test('master diagnostics: Tab and Shift+Tab from "About diagnostics" land on a control, never the page body', async ({ page }) => {
  await page.goto('/master');
  await settlePage(page);
  const icon = page.getByRole('button', { name: 'About diagnostics' });
  const onBody = () => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);
  for (const key of ['Tab', 'Shift+Tab']) {
    await icon.focus();
    await page.keyboard.press(key);
    expect(await onBody(), `${key} from the icon left focus on <body>`).toBe(false);
    await expect(icon).not.toBeFocused();
  }
});
