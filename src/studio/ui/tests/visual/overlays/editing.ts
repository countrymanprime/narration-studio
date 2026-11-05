import type { Page } from '@playwright/test';
import { clickCase, fromState, type OverlayCase } from '../helpers/overlayGuardFor';

/** A repair menu the window was narrowed under, with its button now below the fold: the narrator scrolls to the button and presses it again, which opens the menu at the narrow size. */
async function reopenRepairMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Repair in REAPER' }).click();
  await page.getByRole('menu').waitFor();
}

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
      const word = page.locator('[data-k="p-1:1"]');
      // In a window as small as 360x500 the dock sits over the script pane's last strip (#2804: it must paint above the script, not under it), so after the
      // page scrolls the word can be behind the dock and a real click is refused. The case judges where the menu lands, so it then raises the same
      // contextmenu event at the word's own place.
      await word.click({ button: 'right', timeout: 2000 }).catch(async () => {
        await word.dispatchEvent('contextmenu', {
          button: 2,
          bubbles: true,
          cancelable: true,
          clientX: (await word.boundingBox())?.x ?? 0,
          clientY: (await word.boundingBox())?.y ?? 0,
        });
      });
      await page.locator('[role="menu"]:visible').last().waitFor({ timeout: 2000 });
    },
  },
  fromState('editing', 'output-popover', 'popover'),
  fromState('editing', 'fx-menu', 'menu'),
  fromState('editing', 'daw-tools-menu', 'menu'),
  { ...fromState('editing', 'drawer-cleanup-repair', 'menu'), afterNarrowing: reopenRepairMenu },
  fromState('editing', 'daw-tools-menu-audacity', 'menu'),
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
