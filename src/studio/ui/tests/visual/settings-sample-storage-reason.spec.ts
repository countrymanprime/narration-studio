import { expect, test } from '@playwright/test';
import { APP_DRIVERS } from './app.drivers';
import { settlePage } from './helpers/settle';

// Voice sample storage with a recording tool that cannot keep a region (Audacity): In the DAW and Both are off, and the reason is the option's tooltip, not
// text in the page (owner ruling on #3121, 2026-11-07: "a cursor can hover and get a tooltip; if not, fix that"). Hovering an off option shows its reason, over
// everything else; an option that is on shows none. A disabled radio takes no keyboard focus, so a keyboard reader has the same sentence as its accessible
// description (the radio's aria-describedby, pinned in RadioGroup.test.tsx).
for (const theme of ['light', 'dark'] as const) {
  for (const name of ['In the DAW', 'Both']) {
    test(`Settings / hovering the off choice "${name}" shows why, with Audacity (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/');
      await settlePage(page);
      await APP_DRIVERS.settings!['recording-sample-storage-unavailable']!(page);
      const row = page.locator('[data-row="daw.sampleStorage"]');
      const radio = row.getByRole('radio', { name: new RegExp(`^${name}`) });
      expect(await radio.getAttribute('aria-disabled')).toBe('true');
      await row.getByText(name, { exact: true }).hover();
      const tip = page.getByRole('tooltip').filter({ hasText: /not available with Audacity yet/ });
      await expect(tip).toBeVisible();
      // The tooltip is the topmost thing at its own centre and lies inside the window.
      const box = (await tip.boundingBox())!;
      const top = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('[role="tooltip"]') !== null,
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      expect(top, 'the tooltip is the topmost element at its centre').toBe(true);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1024);
      // It goes when the pointer leaves, and an option that is on says nothing.
      await page.mouse.move(2, 2);
      await expect(tip).toBeHidden();
      await row.getByText('In the project folder', { exact: true }).hover();
      await expect(page.getByRole('tooltip').filter({ hasText: /not available/ })).toHaveCount(0);
    });
  }
}
