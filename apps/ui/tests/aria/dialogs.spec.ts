import { expect, test } from '@playwright/test';
import { DESKTOP, openApp } from './helpers';

// The role trees of the Base UI dialogs, the slide-over and the hint popups (ADR 0047, ADR 0048, ADR 0051). Each modal is
// snapshotted from <body> with `children: equal` at the root: while it is open the rest of the page is aria-hidden, so the
// dialog is the only thing in the tree, which proves both its role and name and the isolation of what is behind it. Inside
// the dialog the match is partial (heading, the controls and the message, not every node), so a copy change to a paragraph does
// not fail the suite but a lost role, name, heading or button does.
const MODALS: { name: string; state: [string, string]; snapshot: string }[] = [
  {
    name: 'the Script mark composer is a modal dialog named for the selected words, with the mark type, the note and Save',
    state: ['script', 'mark-composer'],
    snapshot: 'dialog-mark-composer.aria.yml',
  },
  {
    name: 'Define marks is a modal dialog: each mark type with its name, colour and line, and Done',
    state: ['script', 'define-marks'],
    snapshot: 'dialog-define-marks.aria.yml',
  },
  {
    name: 'the Story Bible import is a modal dialog with its file choice',
    state: ['storybible', 'import-dialog'],
    snapshot: 'dialog-import-entries.aria.yml',
  },
  {
    name: 'a delete confirm is an alert dialog with its title, message and both actions',
    state: ['storybible', 'delete-confirm'],
    snapshot: 'confirm-delete-entry.aria.yml',
  },
  { name: 'the import confirm is an alert dialog', state: ['production', 'import-confirm'], snapshot: 'confirm-import-manuscript.aria.yml' },
  {
    name: 'the unsaved-settings confirm is an alert dialog with three actions',
    state: ['settings', 'navigate-away-confirm'],
    snapshot: 'confirm-unsaved-settings.aria.yml',
  },

  {
    name: 'the recording check is a modal slide-over with its count, the missing region and its paragraph link, and Check again',
    state: ['production', 'recording-check-incomplete'],
    snapshot: 'slide-over-recording-check.aria.yml',
  },
  {
    name: 'the delivery profile editor is a modal dialog with its name field, a switch and number boxes per rule, and Save profile',
    state: ['settings', 'delivery-profile-editor'],
    snapshot: 'dialog-delivery-profile-editor.aria.yml',
  },

  {
    name: 'the stage readiness is a modal slide-over: the verdict, the evidence the app measured, and Confirm and Dismiss',
    state: ['production', 'stage-evidence-recommended'],
    snapshot: 'slide-over-stage-evidence.aria.yml',
  },

  {
    name: 'the chapter track panel is a modal slide-over named for the chapter, with its facts, the Another track…/Unlink link and the Chapter section',
    state: ['production', 'chapter-track-panel-linked'],
    snapshot: 'slide-over-chapter-track.aria.yml',
  },
  {
    name: 'the remove-from-recording confirm is an alert dialog with the What-is-it radio group and both actions',
    state: ['production', 'chapter-remove-confirm'],
    snapshot: 'confirm-remove-from-recording.aria.yml',
  },
  {
    name: 'the "Set up the credits" prompt is a modal dialog with the detected fields and the three dismissal actions',
    state: ['production', 'credits-setup-dialog'],
    snapshot: 'dialog-credits-setup.aria.yml',
  },
  {
    name: 'the "?" shortcut sheet is a modal dialog with every command grouped under a scope heading, and Show all shortcuts',
    state: ['global', 'shortcut-sheet'],
    snapshot: 'dialog-shortcut-sheet.aria.yml',
  },
  {
    name: 'the engine panel is a modal slide-over named Audio engine, with its REAPER project, REAPER tools toolbar, Chapter sync, Tracks and Chapter links regions',
    state: ['engine', 'default'],
    snapshot: 'slide-over-engine-panel.aria.yml',
  },
  {
    name: 'the create-chapter-regions dialog is a modal dialog with the credits selects, the plan table, the not-planned list and Create N regions',
    state: ['engine', 'create-regions-preview'],
    snapshot: 'dialog-create-chapter-regions.aria.yml',
  },
  {
    name: "the companion panel is the whole window: CompactShell's banner and main, the full app behind it hidden, with the Script, Note at playhead, Pickups and Hotkeys regions",
    state: ['booth', 'companion-default'],
    snapshot: 'companion-panel.aria.yml',
  },
  {
    name: 'leaving the Booth while it listens asks first: an alert dialog with Stop reading? and both actions',
    state: ['booth', 'exit-confirm'],
    snapshot: 'confirm-stop-reading.aria.yml',
  },
  {
    name: 'the passage-effect confirm is an alert dialog naming the passage, with the Effect select and both actions',
    state: ['proof-chapter', 'effects-confirm'],
    snapshot: 'confirm-passage-effect.aria.yml',
  },
  {
    name: 'adding a read from another item as a take and making it active asks first: an alert dialog with both actions',
    state: ['proof-chapter', 'takes-confirm'],
    snapshot: 'confirm-add-take-and-activate.aria.yml',
  },
  {
    name: 'the jump menu is a modal dialog holding a combobox field and its list of results',
    state: ['shell', 'jump-menu-open'],
    snapshot: 'dialog-jump-menu.aria.yml',
  },
  {
    name: 'the undo history is a modal slide-over that says when there is nothing to undo',
    state: ['shell', 'history-panel-open'],
    snapshot: 'slide-over-undo-history.aria.yml',
  },
];

for (const modal of MODALS) {
  test(modal.name, async ({ page }) => {
    await openApp(page, DESKTOP, modal.state);
    await expect(page.locator('body')).toMatchAriaSnapshot({ name: modal.snapshot });
  });
}

// A canary for the mechanism the snapshots above rely on: the root `children: equal` only proves the page behind a modal
// is hidden if it fails when the page is not. Take the hiding away and the same snapshot must stop matching.
test('the isolation check fails when the page behind a modal is exposed', async ({ page }) => {
  await openApp(page, DESKTOP, ['storybible', 'delete-confirm']);
  await expect(page.locator('body')).toMatchAriaSnapshot({ name: 'confirm-delete-entry.aria.yml' });
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('[aria-hidden="true"], [data-base-ui-inert]')) {
      element.removeAttribute('aria-hidden');
      element.removeAttribute('data-base-ui-inert');
    }
  });
  await expect(page.locator('body')).not.toMatchAriaSnapshot({ name: 'confirm-delete-entry.aria.yml', timeout: 1000 });
});

// The right-click menu on the script: a menu of two menuitems, and with REAPER away
// both are disabled and read with the reason as their description.
test('the passage effects menu is a menu of two items, and each says why it is off when REAPER is away', async ({ page }) => {
  await openApp(page, DESKTOP, ['proof-chapter', 'effects-menu']);
  await expect(page.getByRole('menu')).toMatchAriaSnapshot({ name: 'menu-passage-effects.aria.yml' });
  await openApp(page, DESKTOP, ['proof-chapter', 'effects-menu-standalone']);
  await expect(page.getByRole('menu')).toMatchAriaSnapshot({ name: 'menu-passage-effects-standalone.aria.yml' });
});

// The shell's menu on empty space: a menu of items, the unavailable ones carrying their reason.
test('the menu on empty space is a menu of the shell items, ending with the jump menu and Find', async ({ page }) => {
  await openApp(page, DESKTOP, ['shell', 'context-menu-open']);
  await expect(page.getByRole('menu')).toMatchAriaSnapshot({ name: 'menu-page-fallback.aria.yml' });
});

// The note on the Reference material group is an info icon inside an alert dialog (ADR 0049): it is a button with the note as its
// description, its popup is a tooltip that stays above the dialog, and the first Escape closes the note and only the second the dialog.
test('the note on the reference material group of the import review is an info icon whose Escape closes it before the dialog', async ({ page }) => {
  await openApp(page, DESKTOP, ['production', 'import-confirm']);
  const dialog = page.getByRole('alertdialog', { name: 'Import Alice.docx' });
  const info = dialog.getByRole('button', { name: 'About reference material' });
  await expect(info).toHaveAttribute('aria-description', /Still readable in the manuscript/);
  await info.hover();
  const note = page.getByRole('tooltip');
  await expect(note).toContainText('Excluded from audiobook totals, Proof and the chapter list. Still readable in the manuscript.');
  await page.keyboard.press('Escape');
  await expect(note).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

// The same, reached by keyboard: Tab to the icon opens its note, the first Escape closes the note only, the second the dialog.
test('the note on reference material reached by keyboard also takes the first Escape', async ({ page }) => {
  await openApp(page, DESKTOP, ['production', 'import-confirm']);
  const dialog = page.getByRole('alertdialog', { name: 'Import Alice.docx' });
  const info = dialog.getByRole('button', { name: 'About reference material' });
  for (let presses = 0; presses < 20 && !(await info.evaluate((element) => element === document.activeElement)); presses++) await page.keyboard.press('Tab');
  await expect(info).toBeFocused();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

// Escape on the readiness slide-over returns focus to the chip on the chapter's row that opened it.
test('Escape closes a stage suggestion’s evidence and returns focus to the readiness chip that opened it', async ({ page }) => {
  await openApp(page, DESKTOP, ['production', 'stage-evidence-recommended']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Stage readiness' })).toHaveCount(0);
  const row = page
    .getByRole('table', { name: 'Chapter pipeline' })
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: /^Chapter 4\b/ }) });
  await expect(row.getByRole('button', { name: /^Stage readiness: / })).toBeFocused();
});
