// How to reach each `settings` state in STATE_CATALOG (see app.drivers.ts).
import type { Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, clickNav, clickSettingsCategory, settingsPanel, confirmDialog, goToPage, openLocalAssets, saveOnlineDictionaryKey } from './shared';

export const settingsDrivers: Record<string, Driver> = {
  'page-top': async (page) => {
    await goToPage(page, 'Settings');
    await page.getByRole('button', { name: 'Replace manuscript' }).waitFor();
    await page.getByRole('combobox', { name: 'Delivery profile', exact: true }).waitFor();
    await page.getByRole('radio', { name: /^Built-in recorder/ }).waitFor();
  },
  'marks-dialog': async (page) => {
    await goToPage(page, 'Settings');
    await page.getByRole('button', { name: 'Edit marks…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Define how you mark up' });
    await dialog.waitFor();
    await dialog.getByLabel('Mark name').first().waitFor();
  },
  'recording-builtin': async (page) => {
    await goToPage(page, 'Settings');
    const builtin = page.getByRole('radio', { name: /^Built-in recorder/ });
    await builtin.click();
    await page
      .getByRole('radio', { name: /^Built-in recorder/ })
      .and(page.locator('[aria-checked="true"]'))
      .waitFor();
  },
  'global-general': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'General');
  },
  'global-manuscript': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Note colour');
  },
  'global-stage-recommendations': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Stage suggestions');
    await page.getByText('Suggest stage advances').waitFor();
  },
  'global-recording-check': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Recording check');
    await page.getByText('Proposed values, not yet calibrated').waitFor();
  },
  'global-proofing': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Proof');
  },
  'global-storybible': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Story Bible');
    await page.getByText('No key', { exact: true }).waitFor();
  },
  'global-storybible-key-saved': async (page) => {
    await saveOnlineDictionaryKey(page);
  },
  'global-delivery': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Delivery profiles');
    await page.getByRole('combobox', { name: 'Default delivery profile' }).waitFor();
  },
  'delivery-profile-editor': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Delivery profiles');
    await page.getByRole('button', { name: 'Duplicate' }).click();
    const editor = page.getByRole('dialog', { name: 'Edit profile' });
    await editor.getByRole('textbox', { name: 'Peak, highest (dBFS)' }).fill('-3.5');
    await editor.getByText('Changed').waitFor();
  },
  'global-daw': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'DAW Integration');
    await page.getByText('REAPER detected').waitFor();
  },
  'global-daw-capabilities': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'DAW Integration');
    await page.getByRole('heading', { name: 'What the DAW can do' }).waitFor();
    await page.getByRole('heading', { name: 'What the DAW can do' }).scrollIntoViewIfNeeded();
  },
  'global-daw-not-detected': async (page) => {
    await page.goto('/?mockDawNotDetected=1');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'DAW Integration');
    await page.getByRole('button', { name: 'Get REAPER' }).waitFor();
  },
  'global-daw-handoff': async (page) => {
    // Reload with the mock's no-linked-DAW seam (see main.tsx): REAPER stays detected (dawCatalogInstalled
    // defaults true), only dawFileLinked flips, so the catalog panel's handoff button appears.
    await page.goto('/?mockNoDaw=1');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'DAW Integration');
    await page.getByRole('button', { name: 'Link a REAPER project file' }).waitFor();
  },
  'global-tts': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'TTS');
  },
  'global-booth': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Booth');
  },
  'global-about': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByText('Not checked yet.').waitFor();
  },
  'local-assets': async (page) => {
    await openLocalAssets(page);
  },
  'local-assets-downloading': async (page) => {
    await openLocalAssets(page, 'installing');
    await page.getByRole('progressbar', { name: /Download progress for/ }).waitFor();
    await page
      .getByText(/44 of 109 MB/)
      .first()
      .waitFor();
  },
  'local-assets-verifying': async (page) => {
    await openLocalAssets(page, 'checking');
    await page.getByRole('button', { name: /^Verifying Preview voice LJ Speech/ }).waitFor();
  },
  'local-assets-needs-repair': async (page) => {
    await openLocalAssets(page, 'damaged');
    await page.getByRole('button', { name: 'Repair Whisper model Small' }).waitFor();
  },
  'local-assets-failed': async (page) => {
    await openLocalAssets(page, 'download-fails');
    await page.getByRole('button', { name: 'Download Preview voice LJ Speech (U.S. English)' }).click();
    await page.getByRole('alert').filter({ hasText: 'did not match the approved one' }).waitFor();
  },
  'local-assets-remove-confirm': async (page) => {
    await openLocalAssets(page);
    await page.getByRole('button', { name: 'Remove Whisper model Small' }).click();
    await confirmDialog(page, 'Remove Whisper model Small?').waitFor();
  },
  'about-update-available': async (page) => {
    await page.goto('/?mockUpdate=available');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByText('Version 0.2.7 is available').waitFor();
  },
  'about-download-confirm': async (page) => {
    await page.goto('/?mockUpdate=available');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByRole('button', { name: 'Download update' }).click();
    await confirmDialog(page, 'Download version 0.2.7?').waitFor();
  },
  'about-download-progress': async (page) => {
    await page.goto('/?mockUpdate=downloading');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByRole('button', { name: 'Download update' }).click();
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await page.getByRole('dialog', { name: 'Download Narration Studio 0.2.7' }).waitFor();
    await page
      .getByText(/160 of 400 MB/)
      .first()
      .waitFor();
  },
  'about-download-failed': async (page) => {
    await page.goto('/?mockUpdate=download-fails');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByRole('button', { name: 'Download update' }).click();
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'so the update was not used' }).waitFor();
  },
  'about-update-ready': async (page) => {
    await page.goto('/?mockUpdate=ready');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByRole('button', { name: 'Install and restart' }).waitFor();
  },
  'about-install-confirm': async (page) => {
    await page.goto('/?mockUpdate=ready');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByRole('button', { name: 'Install and restart' }).click();
    await confirmDialog(page, 'Install version 0.2.7 and restart?').waitFor();
  },
  'about-installing': async (page) => {
    await page.goto('/?mockUpdate=ready');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByRole('button', { name: 'Install and restart' }).click();
    await confirmDialog(page, 'Install version 0.2.7 and restart?').getByRole('button', { name: 'Install and restart' }).click();
    await page.getByRole('dialog', { name: 'Installing Narration Studio 0.2.7' }).waitFor();
  },
  'about-install-refused': async (page) => {
    await page.goto('/?mockUpdate=install-refused');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByRole('button', { name: 'Install and restart' }).click();
    await confirmDialog(page, 'Install version 0.2.7 and restart?').getByRole('button', { name: 'Install and restart' }).click();
    await page.getByRole('alert').filter({ hasText: 'Narration Studio is busy' }).waitFor();
  },
  'about-install-blocked': async (page) => {
    await page.goto('/?mockUpdate=install-blocked');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByRole('button', { name: 'Download update' }).click();
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await page.getByRole('button', { name: 'Close' }).waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Show the downloaded file' }).waitFor();
  },
  'about-development-build': async (page) => {
    await page.goto('/?mockUpdate=development');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByText('A development build is never offered an update.').waitFor();
  },
  'about-check-failed': async (page) => {
    await page.goto('/?mockUpdate=failed');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'About & updates');
    await page.getByText('Could not reach GitHub to check for updates.').waitFor();
  },
  'global-keyboard': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Keyboard & pedals');
    await page.getByText('Keys and pedals').waitFor();
  },
  'global-keyboard-recording': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Keyboard & pedals');
    await openKeyboardRecorder(page, 'Record or stop');
    await page.keyboard.press('KeyJ');
    await page.getByText('J captured. No other command uses it where reading happens.').waitFor();
  },
  'global-keyboard-conflict': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Keyboard & pedals');
    await openKeyboardRecorder(page, 'Next paragraph');
    // ArrowRight is already "Next word"'s default, both `page` scope: a real findConflicts collision.
    await page.keyboard.press('ArrowRight');
    await page.getByText('→ already runs "Next word".').waitFor();
  },
  'project-recording-check': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Recording check', 'This project');
    await page.getByText('A value left blank here uses the Global one.').waitFor();
  },
  'project-proofing': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Proof', 'This project');
  },
  'project-storybible': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Story Bible', 'This project');
  },
  'delivery-profile-custom': async (page) => {
    await page.goto('/?mockDeliveryProfile=custom');
    await settlePage(page);
    await goToPage(page, 'Settings');
    const select = page.getByRole('combobox', { name: 'Delivery profile', exact: true });
    await select.getByRole('option', { name: 'My ACX, tighter peak', selected: true }).waitFor({ state: 'attached' });
  },
  'project-daw': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'DAW Integration', 'This project');
    // The header pill's own text is also "REAPER project linked" (it is a plain text node, not just its aria-label),
    // so wait on copy unique to the settings panel instead of the ambiguous status line.
    await page.getByText('Tracks and Proof read from the linked .rpp file.').waitFor();
  },
  'project-daw-not-linked': async (page) => {
    // Reload with the mock's no-linked-DAW seam (see main.tsx): the project-scope DAW category
    // shows its unlinked copy and "Link a REAPER project file".
    await page.goto('/?mockNoDaw=1');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'DAW Integration', 'This project');
    // Same ambiguity as the linked state: wait on the panel's own copy, not the header pill's identical text.
    await page.getByText('Link a REAPER project (.rpp) file to unlock Tracks and Proof.').waitFor();
  },
  'project-data': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Project data', 'This project');
  },
  'project-credits': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Credits', 'This project');
  },
  // Every empty field with a manuscript-detected candidate shows its own source caption, not just Title and Author.
  'project-credits-detected': async (page) => {
    await page.goto('/?mockCredits=detected');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Credits', 'This project');
    const detected = page.getByText('Detected from the copyright line: “1865”.');
    await detected.waitFor();
    await page.getByText(/Detected from a line ending in .Publishers.: “Macmillan” \(check this\)\./).waitFor();
    // Scrolled into view: at the desktop viewport's own scroll position (single load, no reloadPerViewport) this
    // caption sits below the fold, making the desktop capture pixel-identical to plain project-credits otherwise.
    await detected.scrollIntoViewIfNeeded();
  },
  // The chapter announcement template ?mockCredits=extras adds, previewed for Chapter 1.
  'project-credits-chapter-announcement': async (page) => {
    await page.goto('/?mockCredits=extras');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Credits', 'This project');
    await page.getByRole('combobox', { name: 'Template' }).selectOption({ label: 'Chapter announcement (Chapter announcement)' });
    await page.getByText(/Shown for Chapter 1/).waitFor();
  },
  // The retail sample ?mockCredits=extras picked (Chapter 3, lines 1-3), scrolled into view.
  'project-credits-retail-sample': async (page) => {
    await page.goto('/?mockCredits=extras');
    await settlePage(page);
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Credits', 'This project');
    await page.getByText(/line 1 to Chapter 3 — A Caucus-Race and a Long Tale, line 3/).waitFor();
    await page.getByRole('heading', { name: 'Retail sample' }).scrollIntoViewIfNeeded();
  },
  // A range over 5 minutes (Chapter 1 to Chapter 12) is refused, and the refusal says why.
  'project-credits-retail-sample-refused': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Credits', 'This project');
    await page.getByRole('combobox', { name: 'Sample ends in' }).selectOption({ label: 'Chapter 12 — Alice’s Evidence' });
    await page.getByRole('button', { name: 'Save sample' }).click();
    await page.getByText(/at most 5 minutes/).waitFor();
    await page.getByRole('button', { name: 'Save sample' }).scrollIntoViewIfNeeded();
  },
  'dirty-footer': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Proof');
    // Proof settings fields are <select> comboboxes, not pill buttons
    // (that's a Setup-page-only control) - pick a different model to dirty it.
    await settingsPanel(page, 'Proof').getByRole('combobox').first().selectOption('large-v3');
    // The unsaved-changes footer sits at the end of the page; bring it on screen.
    await settingsPanel(page, 'Proof').getByRole('button', { name: /save/i }).first().scrollIntoViewIfNeeded();
  },
  'navigate-away-confirm': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Proof');
    await settingsPanel(page, 'Proof').getByRole('combobox').first().selectOption('large-v3');
    // Leaving with unsaved changes asks first, so this click does not arrive at Production: it opens the confirm dialog.
    await clickNav(page, 'Production');
    await confirmDialog(page, 'Unsaved settings').waitFor();
  },
  'reset-override': async (page) => {
    await goToPage(page, 'Settings');
    await clickSettingsCategory(page, 'Proof', 'This project');
    // The mock starts with no project override, so make one the way a narrator does: pick a value and save it. Only a
    // field that has an override shows Reset (the model select), and its row is the one that must not squeeze.
    // exact: true: the header's zoom readout is also named "Reset
    // zoom to 100% (now N%)", which a non-exact match treats as containing "Reset" too.
    await page.getByRole('combobox', { name: 'Default Whisper model' }).selectOption('large-v3');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const reset = page.getByRole('button', { name: 'Reset', exact: true });
    await reset.waitFor();
    // The save toast removes itself on a real 2.4 s timer, which would race the screenshot: dismiss it, unless a slow
    // run already let it expire, and wait until it is gone either way.
    const dismissToast = page.getByRole('button', { name: 'Dismiss message' });
    await dismissToast.click({ timeout: 1_000 }).catch(() => undefined);
    await dismissToast.waitFor({ state: 'detached' });
    // Clicking Save scrolled the panel to its footer: bring the top back so the category and its first row are in the shot.
    await page.getByRole('heading', { level: 2, name: 'Proof' }).scrollIntoViewIfNeeded();
    await reset.hover();
  },
};

// Opens a command's recorder on the Keyboard & pedals category: the label
// span is its row's own header row's only direct text-node child (KeyboardPanel.tsx), so one level up from it is the
// row scoped to exactly this command's own Change button, never another row's.
async function openKeyboardRecorder(page: Page, label: string): Promise<void> {
  const headerRow = page.getByText(label, { exact: true }).locator('..');
  await headerRow.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('group', { name: `Change "${label}"` }).scrollIntoViewIfNeeded();
}
