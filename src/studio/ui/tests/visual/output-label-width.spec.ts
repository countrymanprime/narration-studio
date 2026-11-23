// A saved output that is not connected (or whose list would not come) reads "Not connected: <name>" / "Could not check: <name>": the state first, so a long name cut
// off by a narrow select never hides that the output is unusable (#4044). Checked on the Editing page's Output popover and Settings > Voice sample output, at 1024 and 390.
import { expect, test, type Locator } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage, openSettings, showSettingsRow } from './drivers/shared';

const WIDTHS = [1024, 390];
const LONG = 'Headphones (Focusrite USB Audio) with a name long enough to run out of any select, port 3';
const STORAGE_KEY = 'narration-ui-editing-output';

/** What the narrator sees of a closed select: its text starts with the state, and the box stays inside the window. */
async function expectStateFirst(select: Locator, state: RegExp): Promise<void> {
  const seen = await select.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const chosen = el instanceof HTMLSelectElement ? el.selectedOptions[0]?.textContent : el.textContent;
    return { text: (chosen ?? '').trim(), right: box.right, left: box.left, width: document.documentElement.clientWidth };
  });
  expect(seen.text).toMatch(state);
  expect(seen.left).toBeGreaterThanOrEqual(0);
  expect(seen.right).toBeLessThanOrEqual(seen.width + 1);
}

for (const width of WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('the Editing Output popover says "Not connected" before the name of a saved output that is gone', async ({ page }) => {
      await page.addInitScript(
        ([key, device]) => window.localStorage.setItem(key!, JSON.stringify({ volume: 80, muted: false, rate: 1, device })),
        [STORAGE_KEY, LONG],
      );
      await page.goto('/?mockChapterLink=confirmed');
      await settlePage(page);
      await goToPage(page, 'Editing');
      await page.getByRole('toolbar', { name: 'Playback and selection' }).getByRole('button', { name: 'Show volume and output device' }).click();
      const dialog = page.getByRole('dialog', { name: 'Output' });
      await dialog.waitFor();
      await expectStateFirst(dialog.getByRole('combobox', { name: 'Output device' }), /^Not connected: /);
    });

    test('Settings > Voice sample output says "Not connected" before the name of an output that was unplugged', async ({ page }) => {
      await openSettings(page, undefined, '?mockAudioOutputs=long');
      await page.getByRole('radio', { name: /^Built-in recorder/ }).click();
      await page.getByRole('alertdialog', { name: 'Stop recording with REAPER?' }).getByRole('button', { name: 'Switch to the built-in recorder' }).click();
      await page
        .getByRole('radio', { name: /^Built-in recorder/ })
        .and(page.locator('[aria-checked="true"]'))
        .waitFor();
      const row = await showSettingsRow(page, 'daw.sampleOutput');
      const select = row.getByRole('combobox', { name: 'Voice sample output' });
      await select.selectOption({ index: 1 });
      // The computer drops that output: the next read of the list no longer holds it.
      await page.evaluate(() => {
        const devices = navigator.mediaDevices;
        const read = devices.enumerateDevices.bind(devices);
        devices.enumerateDevices = async () => {
          const all = await read();
          const outputs = all.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default');
          const gone = outputs[0]?.deviceId;
          return all.filter((d) => d.deviceId !== gone);
        };
        window.dispatchEvent(new Event('focus'));
      });
      await expectStateFirst(select, /^Not connected: /);
    });
  });
}
