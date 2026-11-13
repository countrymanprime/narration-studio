import { expect, test } from '@playwright/test';
import { WIRE_ENTITIES } from '../../src/api/mockFixtures';
import { settlePage } from './helpers/settle';
import { clickNav } from './drivers/shared';

// #3447: an entry opens read-only, so no text box, select, colour picker, checkbox or toggle in it may be enabled until Edit is pressed.
// Every entry the mock has (each kind, locked and unlocked) is opened the way the narrator does, and the entry's controls are listed.
// Deliberate exceptions: none (Mark reviewed, Play, Rescan and Lock are buttons, not fields).
test.describe.configure({ timeout: 120_000 });

test("Story Bible / an entry's fields are all off until Edit, for every entry", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto('/');
  await settlePage(page);
  await clickNav(page, 'Story Bible');
  for (const entity of WIRE_ENTITIES) {
    await page.locator(`[data-entry-id="${entity.id}"]`).click();
    const body = page.getByRole('group', { name: entity.canonical_name });
    await body.waitFor();
    await page.waitForTimeout(400); // the self-fetching sections (reference clips, dialogue cues) fill in
    const enabled = await body.evaluate((root) =>
      [
        ...root.querySelectorAll<HTMLElement>(
          'input, textarea, select, [role="combobox"], [role="switch"], [role="checkbox"], [role="radio"], [contenteditable="true"]',
        ),
      ]
        .filter((el) => !(el as HTMLInputElement).disabled && el.getAttribute('aria-disabled') !== 'true' && !(el as HTMLInputElement).readOnly)
        .map((el) => el.getAttribute('aria-label') ?? el.id ?? el.tagName),
    );
    expect(enabled, `${entity.canonical_name} (${entity.category}) read-only`).toEqual([]);
  }
});
