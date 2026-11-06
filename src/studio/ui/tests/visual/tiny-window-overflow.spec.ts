// Issue 2809: at 320x300 Proof's Inspector pushed "Next note" past its own edge, and the Booth's Levels popup was 58 px tall with its content
// wider than the box (so the meter ran off the right). In the smallest window both fit: nothing in either is outside the box that holds it,
// and the popup has room to read (it scrolls inside itself when its content is taller).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

const TINY = { width: 320, height: 300 };

async function open(page: Page, path: string, theme: 'light' | 'dark'): Promise<void> {
  await page.setViewportSize(TINY);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(path);
  await settlePage(page);
}

for (const theme of ['light', 'dark'] as const) {
  test(`Proof: the Inspector's note buttons stay inside the Inspector at 320x300 (${theme})`, async ({ page }) => {
    await open(page, '/proof', theme);
    const inspector = page.getByRole('complementary', { name: 'Note' });
    await inspector.waitFor();
    const next = inspector.getByRole('button', { name: 'Next note' });
    await next.scrollIntoViewIfNeeded();
    const box = await inspector.evaluate((aside) => {
      const a = aside.getBoundingClientRect();
      const out: string[] = [];
      for (const el of aside.querySelectorAll('button, h2, [role=group]')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.left < a.left - 0.5 || r.right > a.right + 0.5))
          out.push(
            `${el.getAttribute('aria-label') ?? el.tagName} ${Math.round(r.left)}-${Math.round(r.right)} outside ${Math.round(a.left)}-${Math.round(a.right)}`,
          );
      }
      return { out, sideways: aside.scrollWidth > aside.clientWidth + 1 };
    });
    expect(box.out).toEqual([]);
    expect(box.sideways).toBe(false);
    await expect(next).toBeVisible();
  });

  test(`Booth: the Levels popup has room and holds its content at 320x300 (${theme})`, async ({ page }) => {
    await open(page, '/booth', theme);
    await page.getByRole('button', { name: 'Record options' }).first().click();
    const popup = page.getByRole('dialog', { name: 'Record options' });
    await popup.waitFor();
    const m = await popup.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const wide: string[] = [];
      for (const child of el.querySelectorAll('*')) {
        const c = child.getBoundingClientRect();
        // The popup's padding is 16 px; the Slider's thumb room (9 px) is meant to sit in it, so the bound is the popup's own edge less 8 px.
        if (c.width > 0 && c.right > r.right - 8 + 0.5) wide.push(`${child.tagName} right ${Math.round(c.right)} over ${Math.round(r.right - 8)}`);
      }
      return {
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        left: r.left,
        right: r.right,
        sideways: el.scrollWidth > el.clientWidth + 1,
        wide: wide.slice(0, 5),
      };
    });
    expect(m.wide, 'content wider than the popup').toEqual([]);
    expect(m.sideways).toBe(false);
    expect(m.height, 'the popup is tall enough to read').toBeGreaterThanOrEqual(110);
    // The popup may lie over the top of the Booth's bars, but not over Record or its own Record options button: both stay the topmost thing at their corners and centre.
    const uncovered = await page.evaluate(() => {
      const covered: string[] = [];
      for (const label of ['Record', 'Record options']) {
        const button = [...document.querySelectorAll('button')].find(
          (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim())?.toLowerCase() === label.toLowerCase() && b.getBoundingClientRect().width > 0,
        );
        if (!button) {
          covered.push(`${label}: not found`);
          continue;
        }
        const r = button.getBoundingClientRect();
        for (const [x, y] of [
          [r.left + 2, r.top + 2],
          [r.right - 2, r.top + 2],
          [r.left + r.width / 2, r.top + r.height / 2],
          [r.left + 2, r.bottom - 2],
          [r.right - 2, r.bottom - 2],
        ] as const) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(button === hit || button.contains(hit))) covered.push(`${label} at ${Math.round(x)},${Math.round(y)}`);
        }
      }
      return covered;
    });
    expect(uncovered, 'the popup covers Record or the Record options button').toEqual([]);
    expect(m.top).toBeGreaterThanOrEqual(0);
    expect(m.bottom).toBeLessThanOrEqual(TINY.height);
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.right).toBeLessThanOrEqual(TINY.width);
  });
}

// A window shrunk while the Levels popup is open (found by the narrator walkthrough: it stayed 80 px tall): the popup is placed again for the new size.
for (const theme of ['light', 'dark'] as const) {
  test(`Booth: the Levels popup is placed again when the window shrinks under it to 320x300 (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/booth');
    await settlePage(page);
    await page.getByRole('button', { name: 'Record options' }).first().click();
    const popup = page.getByRole('dialog', { name: 'Record options' });
    await popup.waitFor();
    await page.setViewportSize(TINY);
    await expect
      .poll(async () => (await popup.boundingBox())!.height, { message: 'the popup keeps room to read after the resize' })
      .toBeGreaterThanOrEqual(110);
    const box = (await popup.boundingBox())!;
    const record = (await page.getByRole('button', { name: 'Record', exact: true }).boundingBox())!;
    expect(box.y + box.height, 'the popup stays above Record').toBeLessThanOrEqual(record.y + 1);
  });
}

// The footer's controls (Record, the timer, Levels, Cold read) wrap onto a second line rather than leaving the window (found by the QA pass: Cold read was cut off at 320 px).
for (const theme of ['light', 'dark'] as const) {
  for (const query of ['', '?mockEngine=builtin']) {
    test(`Booth: every footer control is inside the window at 320x300 (${theme}${query ? ', built-in recorder' : ''})`, async ({ page }) => {
      await open(page, `/booth${query}`, theme);
      const out = await page.evaluate(() => {
        const found: string[] = [];
        for (const id of ['#btimer', '#blevels', '#bcold']) {
          const el = document.querySelector<HTMLElement>(id);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.right > innerWidth + 0.5 || r.left < -0.5) found.push(`${id} ${Math.round(r.left)}-${Math.round(r.right)} of ${innerWidth}`);
        }
        const record = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().toLowerCase() === 'record');
        if (record && record.getBoundingClientRect().right > innerWidth + 0.5) found.push('Record');
        return found;
      });
      expect(out).toEqual([]);
    });
  }
}
