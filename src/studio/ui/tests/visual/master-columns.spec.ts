import { expect, test, type Page } from '@playwright/test';
import { masterDrivers } from './drivers/master';
import { settlePage } from './helpers/settle';

// Master & QC's per-file table keeps its columns whatever the rows say (alignment audit XMS-1, XMS-2, XMS-3, R4MS1-1, R4MS1-2, R4MS1-7):
// one long error message in one row used to set every column's width, so the headings moved between states, every chapter name
// wrapped and the "Not measured" pills folded. Measured in the real app, in the states that differ: nothing measured, cancelled, broken.
type Layout = { columns: { name: string; left: number; right: number; height: number }[]; nameHeights: number[]; pillHeights: number[] };

async function layout(page: Page): Promise<Layout> {
  return page.getByRole('grid', { name: 'Per-file checks' }).evaluate((table) => {
    const box = (el: Element) => el.getBoundingClientRect();
    return {
      columns: [...table.querySelectorAll('thead th')].map((th) => ({
        name: th.textContent ?? '',
        left: Math.round(box(th).left),
        right: Math.round(box(th).right),
        height: Math.round(box(th).height),
      })),
      // A name's height in lines is what wrapping changes; the row's own height also follows the pill and the message.
      nameHeights: [...table.querySelectorAll('tbody tr > :first-child')].map((cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        return Math.round(range.getBoundingClientRect().height);
      }),
      pillHeights: [...table.querySelectorAll('tbody tr > :last-child > *')].map((pill) => Math.round(box(pill).height)),
    };
  });
}

for (const size of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'small-desktop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`Master / the per-file table keeps its columns in every state / ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const seen: Record<string, Layout> = {};
    for (const state of ['empty', 'cancelled', 'error']) {
      await page.goto('/');
      await settlePage(page);
      await masterDrivers[state]!(page);
      seen[state] = await layout(page);
    }
    const { empty, cancelled, error } = seen as Record<'empty' | 'cancelled' | 'error', Layout>;
    expect(cancelled.columns, 'the headings stand at the same x after a cancel').toEqual(empty.columns);
    expect(error.columns, 'the headings stand at the same x after a run broke').toEqual(empty.columns);
    expect(new Set(error.columns.map((column) => column.height)).size, 'every heading is on one line').toBe(1);
    const file = error.columns[0]!;
    expect(file.right - file.left, 'File keeps room for a chapter name').toBeGreaterThanOrEqual(150);
    expect(error.nameHeights.slice(0, empty.nameHeights.length), 'one long message wraps no chapter name').toEqual(
      empty.nameHeights.slice(0, error.nameHeights.length),
    );
    for (const heights of [cancelled.pillHeights, error.pillHeights]) expect(Math.max(...heights), 'no Result pill folds').toBeLessThanOrEqual(24);
  });
}
