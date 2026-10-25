import { expect, test } from '@playwright/test';
import { masterDrivers } from './drivers/master';
import { settlePage } from './helpers/settle';

// Where Master & QC's delivery package sits (alignment audit XMS-4, XMS-5): beside the long left column it stays in view as the page
// scrolls, and in one column it comes straight after the files card, not after the eleventh panel.
test('Master / the delivery package stays in view beside a scrolled page / desktop 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settlePage(page);
  await masterDrivers['diagnostics-findings']!(page);
  const box = await page.getByRole('complementary', { name: /^Delivery package/ }).boundingBox();
  expect(box, 'the package card is drawn').not.toBeNull();
  expect(box!.y, 'its top is on screen').toBeGreaterThanOrEqual(0);
  expect(box!.y, 'its top is near the top of the window').toBeLessThan(200);
});

for (const size of [
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Master / one column puts the delivery package under the files / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await settlePage(page);
    await masterDrivers.empty!(page);
    const top = async (locator: ReturnType<typeof page.getByRole>) => (await locator.boundingBox())!.y;
    const files = await top(page.getByRole('region', { name: 'Per-file checks' }));
    const pkg = await top(page.getByRole('complementary', { name: /^Delivery package/ }));
    const consistency = await top(page.getByRole('region', { name: 'Book consistency' }));
    expect(pkg, 'the package comes after the files').toBeGreaterThan(files);
    expect(pkg, 'and before the book consistency').toBeLessThan(consistency);
  });
}

// Sticky must not push the package below the files card's top before anything has scrolled (XMS-17: the two columns start level).
test('Master / the two columns start level / desktop 1440x900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settlePage(page);
  await masterDrivers.empty!(page);
  const files = (await page.getByRole('region', { name: 'Per-file checks' }).boundingBox())!.y;
  const pkg = (await page.getByRole('complementary', { name: /^Delivery package/ }).boundingBox())!.y;
  expect(Math.abs(pkg - files)).toBeLessThanOrEqual(1);
});
