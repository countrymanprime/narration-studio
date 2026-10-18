import type { Page } from '@playwright/test';
import { clickCase, contextMenuCase, hoverCase, type OverlayCase } from '../helpers/overlayGuardFor';

// The overlays every page with the sidebar has, because the shell draws them (components/layout/AppShell.tsx). Two lists, because
// they differ in what decides where they are drawn:
//
// - `shellPageCases` run on every page: the content area's context menu (it opens wherever the pointer is, over the page's own
//   content) and the rail that opens over the page below 1360 px.
// - `shellChromeCases` run on `SHELL_CHROME_PAGES` only: the top bar's hints, Jump to, History (opened from the jump menu) and the navigation drawer. They are
//   anchored to the top bar, which AppShell draws once for every page, and they are portalled to the body at a layer of the one scale
//   (styles.css: hints 1000, dialogs and the drawer 60). Nothing a page owns sits at or above those layers
//   (shellOverlayScope.test.ts reads the sources and fails if one does), so the page under them cannot change what is on top of them.
//   Three pages with different content stand for the ten.
//
// overlays/pages.ts registers both lists; a page adopts the guard by being listed there.

const header = (page: Page) => page.locator('main > header');
const atLeastMd = ({ width }: { width: number }) => width >= 860;

export const shellPageCases: OverlayCase[] = [
  contextMenuCase('context menu on the page'),
  {
    name: 'navigation rail opened over the page',
    kind: 'rail',
    // From 860 to 1359 px the rail is icons that open to labels over the page while the pointer is on them.
    viewports: ({ width }) => width >= 860 && width < 1360,
    root: (page) => page.locator('aside:visible > div').first(),
    open: async (page) => {
      await page.locator('aside:visible').first().hover();
    },
  },
];

// A top-bar hint does not move with the content, so one pass over content scrolled to the end (where a sticky footer or table header
// sits under the hint) stands for the halfway one too.
export const shellChromeCases: OverlayCase[] = [
  hoverCase('hint on Switch project', (page) => header(page).getByRole('button', { name: /^Switch project/ }), { scrolled: 'end' }),
  hoverCase('hint on Jump to or run', (page) => header(page).getByRole('button', { name: 'Jump to or run…' }), { scrolled: 'end' }),
  clickCase('Jump to or run', 'dialog', (page) => header(page).getByRole('button', { name: 'Jump to or run…' })),
  {
    // The History panel has no header button now: it opens from the jump menu's command, so the guard opens it the way a narrator does.
    name: 'History',
    kind: 'dialog',
    viewports: atLeastMd,
    open: async (page) => {
      await header(page).getByRole('button', { name: 'Jump to or run…' }).click();
      await page.getByRole('combobox', { name: 'Jump menu' }).fill('> open the undo history');
      await page.getByRole('option', { name: /^Open the undo history/ }).click();
      await page.getByRole('dialog', { name: 'Undo history' }).waitFor();
    },
  },
  {
    name: 'navigation drawer',
    kind: 'drawer',
    viewports: ({ width }) => width < 860,
    open: async (page) => {
      await page.getByRole('button', { name: 'Open navigation' }).click();
    },
  },
];
