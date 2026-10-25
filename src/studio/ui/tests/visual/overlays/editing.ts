import type { Page } from '@playwright/test';
import { clickCase, fromState, type OverlayCase } from '../helpers/overlayGuardFor';

const stepper = (page: Page) => page.getByRole('button', { name: /^Chapter: .*Change chapter$/ });

// Editing's overlays: the chapter stepper's menu, the Add FX menu and its dialog, the Voice sample dialog and the popover of a voice-sample dot, the Replace audio dialog and the popover of a narrator's name, the delete and take-step confirms, the context
// menu on a word and the docked waveform's own menu, and the clean-up and effects drawer, which the catalog reaches (tests/visual/drivers/editing.ts).
export const editingCases: OverlayCase[] = [
  // Not at 320x300: the sticky key-hint bar at the foot of the page covers the stepper in a 300 px window, so the click never lands (a page
  // behaviour at a window far below the 960 px minimum; listed as not covered, as Proof's and Pickups' steppers are).
  clickCase('chapter stepper menu', 'menu', stepper, { viewports: ({ height }) => height >= 500 }),
  {
    name: 'context menu on a word',
    kind: 'context-menu',
    // Not at 320x300: the word cannot be clicked there (the click times out); listed as not covered.
    viewports: ({ height }) => height >= 500,
    open: async (page) => {
      await page.locator('[data-k="p-1:1"]').click({ button: 'right' });
      await page.locator('[role="menu"]:visible').last().waitFor({ timeout: 2000 });
    },
  },
  fromState('editing', 'output-popover', 'popover'),
  fromState('editing', 'fx-menu', 'menu'),
  fromState('editing', 'word-menu-fx', 'menu'),
  fromState('editing', 'wave-menu', 'menu'),
  fromState('editing', 'fx-dialog'),
  fromState('editing', 'voice-sample-dialog'),
  fromState('editing', 'voice-sample-mark-open', 'popover'),
  fromState('editing', 'replace-dialog'),
  fromState('editing', 'replace-mark-open', 'popover'),
  fromState('editing', 'delete-dialog'),
  fromState('editing', 'suggestion-step'),
  fromState('editing', 'drawer-cleanup', 'slide-over', { root: (page) => page.locator('#drawer') }),
];
