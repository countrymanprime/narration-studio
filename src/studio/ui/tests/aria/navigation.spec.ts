import { expect, test } from '@playwright/test';
import { settlePage } from '../visual/helpers/settle';
import { DESKTOP, NARROW, RAIL, openApp } from './helpers';

// The role trees of the two shapes of the primary navigation: the sidebar and the drawer that replaces it below
// 860 px. The item list is pinned with `children: equal`, so an added, removed or reordered item fails here; everything else
// is matched partially. The snapshots are in tests/aria/snapshots (see docs/operations/verification-tooling.md).
test('the navigation lists exactly the pages, in order, with Settings after it', async ({ page }) => {
  await openApp(page, DESKTOP);
  await expect(page.getByRole('complementary')).toMatchAriaSnapshot({ name: 'navigation-sidebar.aria.yml' });
});

test('the drawer is a named modal dialog with the same list, and hides the page behind it', async ({ page }) => {
  await openApp(page, NARROW);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Navigation' }).waitFor();
  await expect(page.locator('body')).toMatchAriaSnapshot({ name: 'navigation-drawer.aria.yml' });
});

test('the collapsed rail is the same named navigation as the sidebar', async ({ page }) => {
  await openApp(page, RAIL);
  await expect(page.getByRole('complementary', { name: 'Primary navigation' })).toMatchAriaSnapshot({ name: 'navigation-rail.aria.yml' });
});

// The header is the Studio Next mock's top bar: the project name as a button, the jump button and the engine chip. Back, Forward, Undo, History
// and the zoom steps left it for the jump menu (dialog-jump-menu.aria.yml pins the menu), so the header's own tree is pinned here.
test('the header names its project button and its jump button, with no history, undo or zoom controls', async ({ page }) => {
  await openApp(page, DESKTOP);
  await expect(page.locator('main > header')).toMatchAriaSnapshot({ name: 'navigation-header.aria.yml' });
});

// The zoom chip is drawn only off 100%: with ?mockZoom=125 it is a button just left of the jump button (#2251 item 25).
test('the header draws the zoom chip as a button only while zoom is not 100%', async ({ page }) => {
  await openApp(page, DESKTOP);
  await page.goto('/?mockZoom=125');
  await settlePage(page);
  await expect(page.locator('main > header')).toMatchAriaSnapshot({ name: 'navigation-header-zoom.aria.yml' });
});

// With no manuscript the nine pages that need one are still buttons in the list, with their names, but off; Production and
// Settings are not. An off item stays in the tab order, so this tree has the same buttons as the sidebar above, not fewer.
test('with no manuscript the sidebar lists the pages that need one as off buttons that keep their names', async ({ page }) => {
  await openApp(page, DESKTOP);
  await page.goto('/?mockNoManuscript=1');
  await settlePage(page);
  await expect(page.getByRole('complementary')).toMatchAriaSnapshot({ name: 'navigation-sidebar-no-manuscript.aria.yml' });
});
