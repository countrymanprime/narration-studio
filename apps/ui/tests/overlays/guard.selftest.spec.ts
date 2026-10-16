// Negative controls for the overlay guard: it must go red for an overlay that is covered or off screen, and green for one that is not.
import { expect, test } from '@playwright/test';
import { probeOverlay } from './overlayGuard';

const page = (body: string) => `<!doctype html><body style="margin:0">${body}</body>`;

test.describe('overlay guard self-test', () => {
  test.use({ viewport: { width: 400, height: 300 } });

  test('passes a topmost overlay, descendants included', async ({ page: p }) => {
    await p.setContent(page('<div id="o" style="position:fixed;left:50px;top:50px;width:200px;height:100px;z-index:10"><button>x</button></div>'));
    expect((await probeOverlay(p.locator('#o'))).ok).toBe(true);
  });

  test('fails an overlay covered by a higher layer, and names the element', async ({ page: p }) => {
    await p.setContent(
      page(
        '<div id="o" style="position:fixed;left:50px;top:50px;width:200px;height:100px;z-index:10"></div><nav aria-label="rail" style="position:fixed;left:0;top:0;width:150px;height:300px;z-index:30"></nav>',
      ),
    );
    const result = await probeOverlay(p.locator('#o'));
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('covered by <nav');
  });

  test('fails an overlay that leaves the viewport', async ({ page: p }) => {
    await p.setContent(page('<div id="o" style="position:fixed;left:300px;top:250px;width:200px;height:100px;z-index:10"></div>'));
    const result = await probeOverlay(p.locator('#o'));
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('not fully on screen');
  });
});
