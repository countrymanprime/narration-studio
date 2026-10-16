import type { Page } from '@playwright/test';
import { clickCase, contextMenuCase, hoverCase, type OverlayCase } from '../helpers/overlayGuardFor';

// The overlays every page with the sidebar has, because the shell draws them (components/layout/AppShell.tsx): the content area's
// context menu, the top bar's hints and its Jump to / History / Engine overlays, the navigation drawer of the narrow layout and the
// rail that opens over the page below 1360 px. Written once and run on every page: what lies under them is the page's.

const header = (page: Page) => page.locator('main > header');
const atLeastMd = ({ width }: { width: number }) => width >= 768;

export const shellCases: OverlayCase[] = [
  contextMenuCase('context menu on the page'),
  hoverCase('hint on Back', (page) => header(page).getByRole('group', { name: 'Page history' }).locator('xpath=./span').first(), { viewports: atLeastMd }),
  hoverCase('hint on Jump to or run', (page) => header(page).getByRole('button', { name: 'Jump to or run…' })),
  hoverCase('hint on Zoom in', (page) => header(page).getByRole('button', { name: 'Zoom in' }), { viewports: atLeastMd }),
  hoverCase('hint on Undo', (page) => header(page).getByRole('group', { name: 'Undo history' }).locator('xpath=./span').first(), { viewports: atLeastMd }),
  clickCase('Jump to or run', 'dialog', (page) => header(page).getByRole('button', { name: 'Jump to or run…' })),
  clickCase('History', 'dialog', (page) => header(page).getByRole('button', { name: 'History', exact: true }), { viewports: atLeastMd }),
  {
    name: 'navigation drawer',
    kind: 'drawer',
    viewports: ({ width }) => width < 768,
    open: async (page) => {
      await page.getByRole('button', { name: 'Open navigation' }).click();
    },
  },
  {
    name: 'navigation rail opened over the page',
    kind: 'rail',
    // From 768 to 1359 px the rail is icons that open to labels over the page while the pointer is on them (ADR 0761).
    viewports: ({ width }) => width >= 768 && width < 1360,
    root: (page) => page.locator('aside:visible > div').first(),
    open: async (page) => {
      await page.locator('aside:visible').first().hover();
    },
  },
];
