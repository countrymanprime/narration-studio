import { expect, test } from '@playwright/test';
import { storybibleDrivers } from './drivers/storybible';
import { settlePage } from './helpers/settle';

// The entry's sections share one rhythm (alignment audit SBX-12): every titled section below the fields (Properties, Voice samples,
// Reference clips, Dialogue cues, Relationships) is set off by a rule the same distance above its label, and Speaker colour's label is
// the same weight as the other labels. Hatter: a Character with voice samples, reference clips and a dialogue cue.
const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
];
const SECTIONS = ['Properties', 'Voice samples', 'Reference clips', 'Dialogue cues', 'Relationships'];
test.describe.configure({ timeout: 90_000 });

for (const size of SIZES) {
  test(`Story Bible / the entry's sections share one rule and rhythm / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    page.setDefaultTimeout(20_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await storybibleDrivers['character-voice-references'](page);
    const body = page.getByRole('group', { name: 'Hatter' });
    const gaps: Record<string, number | null> = {};
    for (const label of SECTIONS) {
      const text = body.getByText(label, { exact: true }).first();
      // The distance from the nearest ruled ancestor's top edge down to the row holding the label, or null when no ancestor draws a rule.
      gaps[label] = await text.evaluate((element) => {
        for (let node = element.parentElement; node && !node.matches('[role="group"]'); node = node.parentElement) {
          if (getComputedStyle(node).borderTopWidth === '1px') {
            // To the section's first row (a heading row holding Check again is taller than the label it centres).
            let row: Element = element;
            while (row.parentElement && row.parentElement !== node) row = row.parentElement;
            return Math.round(row.getBoundingClientRect().top - node.getBoundingClientRect().top);
          }
        }
        return null;
      });
    }
    for (const label of SECTIONS) expect(gaps[label], `${label} has a rule over it`).not.toBeNull();
    const values = Object.values(gaps) as number[];
    expect(Math.max(...values) - Math.min(...values), `every rule is the same distance above its label ${JSON.stringify(gaps)}`).toBeLessThanOrEqual(2);
    const weight = await body.getByText('Speaker colour', { exact: true }).evaluate((element) => getComputedStyle(element).fontWeight);
    const other = await body
      .getByText('Voice samples', { exact: true })
      .first()
      .evaluate((element) => getComputedStyle(element).fontWeight);
    expect(weight, 'Speaker colour is labelled like the other sections').toBe(other);
  });
}
