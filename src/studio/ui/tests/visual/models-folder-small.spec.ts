// Settings > Models & downloads at 320 x 300: the dialogs the folder move opens keep what they are about, and the progress, in view.
import { expect, test } from '@playwright/test';
import { confirmDialog, openSettings } from './drivers/shared';

test.use({ viewport: { width: 320, height: 300 } });

test.describe('Models folder dialogs on a very small window', () => {
  test('the delete confirm names the folder in its title and its Delete button is in view', async ({ page }, info) => {
    await openSettings(page, 'Models & downloads', '?mockMove=moved');
    await page.getByRole('button', { name: 'Delete old copy…' }).click();
    const dialog = confirmDialog(page, /^Delete the old copy in/);
    await dialog.waitFor();
    await expect(dialog.getByRole('heading')).toContainText('AppData');
    const button = dialog.getByRole('button', { name: 'Delete', exact: true });
    await expect(button).toBeInViewport();
    await page.screenshot({ path: info.outputPath('q-del-320.png') });
  });

  test('the move dialog shows its progress bar above Cancel without scrolling', async ({ page }, info) => {
    await openSettings(page, 'Models & downloads', '?mockMove=copying');
    await page.getByRole('button', { name: 'Change location…' }).click();
    await confirmDialog(page, 'Change where downloads are kept?').getByRole('button', { name: 'Choose a folder…' }).click();
    const dialog = page.getByRole('dialog', { name: /^Moving models/ });
    await dialog.waitFor();
    await page.screenshot({ path: info.outputPath('q-move-320.png') });
    // In the scrolled body, above the buttons: not clipped below the fold.
    const bar = await dialog.getByRole('progressbar').boundingBox();
    const cancel = await dialog.getByRole('button', { name: 'Cancel' }).boundingBox();
    expect(bar && cancel && bar.y + bar.height <= cancel.y).toBe(true);
    await page.screenshot({ path: info.outputPath('q-move-320.png') });
  });
});
