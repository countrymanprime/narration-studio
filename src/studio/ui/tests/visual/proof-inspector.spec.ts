import { expect, test, type Page } from '@playwright/test';
import { proofDrivers } from './drivers/proof';
import { settlePage } from './helpers/settle';

// The Proof Inspector's layout, which the state captures show but do not measure (alignment audit R4TB-5, XPF-5, XPF-6, XPF-14, R3PF-9,
// R3PF-14).

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Note' });

/** Starts the app, as the state suite does before a driver runs, and drives `state`. */
async function drive(page: Page, size: { width: number; height: number }, state: string): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await settlePage(page);
  await proofDrivers[state](page);
}

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Proof / the Inspector's quotes are not drawn as text boxes / ${size.name}`, async ({ page }) => {
    await drive(page, size, 'default');
    const textarea = inspector(page).getByRole('textbox', { name: /Note with the decision/ });
    const fieldFill = await textarea.evaluate((element) => getComputedStyle(element).backgroundColor);
    for (const quote of await inspector(page).locator('[data-quote]').all()) {
      const look = await quote.evaluate((element) => ({ border: getComputedStyle(element).borderTopWidth, fill: getComputedStyle(element).backgroundColor }));
      expect(look.border, 'a quote has no field border').toBe('0px');
      expect(look.fill, 'a quote is not filled like a field').not.toBe(fieldFill);
    }
  });

  test(`Proof / a thread message runs the Inspector's width, with its stamp in the app's one format / ${size.name}`, async ({ page }) => {
    await drive(page, size, 'note-thread');
    const thread = inspector(page).getByRole('region', { name: 'Notes on this finding' });
    for (const message of await thread.locator('[data-message]').all()) {
      const box = (await message.boundingBox())!;
      const text = (await message.getByText(/proofer|pink eyes/).boundingBox())!;
      expect(text.width, 'the message text takes most of the message box').toBeGreaterThan(box.width * 0.6);
      expect(await message.innerText(), 'the stamp names the year, as the check card and a decision do').toMatch(/\b20\d\d\b/);
    }
    const reply = (await thread.getByRole('textbox', { name: 'Add a note' }).boundingBox())!;
    const add = (await thread.getByRole('button', { name: 'Add note' }).boundingBox())!;
    expect(Math.abs(add.y + add.height - (reply.y + reply.height)), 'Add note sits on the box bottom line').toBeLessThanOrEqual(1);
  });
}

test('Proof / Reopen is as tall as the icon buttons on its row', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'default');
  await page.getByRole('region', { name: 'Notes', exact: true }).locator('tr[data-row]').filter({ hasText: 'and then' }).click();
  const actions = inspector(page).getByRole('group', { name: 'Actions' });
  const reopen = (await actions.getByRole('button', { name: 'Reopen' }).boundingBox())!;
  const icon = (await actions.getByRole('button', { name: 'Open this chapter in Script' }).boundingBox())!;
  expect(reopen.height).toBe(icon.height);
});

test('Proof / evidence that changed only in timing does not show two identical quotes', async ({ page }) => {
  await drive(page, { width: 1440, height: 900 }, 'evidence-changed');
  const banner = inspector(page).getByRole('alert').filter({ hasText: 'The evidence changed' });
  const was = banner.locator('[data-was]');
  if ((await was.count()) > 0) expect(await was.innerText()).not.toBe(await banner.locator('[data-now]').innerText());
  await expect(banner, 'the banner says why the decision buttons are off').toContainText('wait until you take the new evidence');
});
