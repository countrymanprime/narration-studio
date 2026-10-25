// How to reach each `settings` state in STATE_CATALOG (see app.drivers.ts). The page is one category at a time, chosen in the category list
// (shared.ts: openSettingsCategory); each driver waits for what its own state shows.
import type { Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, clickNav, clickVisible, confirmDialog, freezeClock, openAdvanced, openSettings, showSettingsRow } from './shared';
import { brand } from '../../../src/brand.gen';

const WHISPER_SMALL = 'whisper/small';

/** The app booted in an update state (`?mockUpdate=`), on App & updates with the This version panel, which holds the update, at the top of the page area. */
async function openUpdates(page: Page, seed: string): Promise<void> {
  await openSettings(page, 'App & updates', `?mockUpdate=${seed}`);
  await page.getByRole('region', { name: 'This version' }).evaluate((panel) => panel.scrollIntoView({ block: 'start' }));
}

/**
 * Settings > Recording & DAW with the built-in recorder chosen on a computer whose outputs the mock names (`?mockAudioOutputs=`: its two usual outputs, or
 * with `outputs` 'long' its long and right-to-left ones), and the Voice sample output row on screen with `choose` picked. The mock replaces the webview's
 * whole output listing when the page boots, so the names come from it, not from a script of the suite's own.
 */
async function openSampleOutput(page: Page, outputs: 'usual' | 'long', choose: string): Promise<void> {
  await openSettings(page, undefined, `?mockDawExperimentalOn=1${outputs === 'long' ? '&mockAudioOutputs=long' : ''}`);
  await page.getByRole('radio', { name: /^Built-in recorder/ }).click();
  // REAPER is linked, so the switch asks first.
  await page.getByRole('alertdialog', { name: 'Stop recording with REAPER?' }).getByRole('button', { name: 'Switch to the built-in recorder' }).click();
  await page
    .getByRole('radio', { name: /^Built-in recorder/ })
    .and(page.locator('[aria-checked="true"]'))
    .waitFor();
  const row = await showSettingsRow(page, 'daw.sampleOutput');
  await row.getByRole('combobox', { name: 'Voice sample output' }).selectOption(choose);
  await row.getByRole('button', { name: 'Refresh the list' }).waitFor();
}

/** Brings the connection card under Record with to the top of the page area, where the engine's state and its actions are. */
async function showConnection(page: Page): Promise<void> {
  const card = page.getByRole('group', { name: 'Connection' });
  await card.waitFor();
  await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
}

/** Settings > Models & downloads, booted with a mock seed when one is given (`?mockAssets=`): the rows are on screen once the list has loaded. */
async function openModels(page: Page, query = ''): Promise<void> {
  await openSettings(page, 'Models & downloads', query);
  await page.getByRole('table', { name: 'Models, voices and tools' }).waitFor();
  await page.locator(`[data-asset="${WHISPER_SMALL}"]`).waitFor();
}

/** Pulls the update dialog flow forward: Download update, then the confirm's Download. */
async function startUpdateDownload(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Download update' }).click();
  await page.getByRole('button', { name: 'Download', exact: true }).click();
}

/** Opens a command's recorder on the Shortcuts row: the label span is its row's own header row's only direct text-node child (KeyboardPanel.tsx). */
async function openKeyboardRecorder(page: Page, label: string): Promise<void> {
  const headerRow = page.getByText(label, { exact: true }).locator('..');
  await headerRow.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('group', { name: `Change "${label}"` }).scrollIntoViewIfNeeded();
}

/** Appearance & keys, scrolled to the Shortcuts row. */
async function openShortcuts(page: Page): Promise<void> {
  await openSettings(page, 'Appearance & keys');
  await showSettingsRow(page, 'keys.map');
  await page.getByRole('region', { name: 'Shortcuts' }).waitFor();
}

/** Project > Edit credits…, the real editor open in its row. */
async function openCreditsEditor(page: Page, query = ''): Promise<void> {
  await openSettings(page, 'Project', query);
  await showSettingsRow(page, 'project.credits');
  await page.getByRole('button', { name: 'Edit credits…' }).click();
  await page.getByRole('combobox', { name: 'Template' }).waitFor();
}

/** Set on a page with the first entry's "Change it here for now" opened: the Recording check rules. */
async function openFirstPagePanel(page: Page): Promise<void> {
  await openSettings(page, 'Set on a page');
  const entry = page.locator('[data-page-setting="ps.coverage"]');
  await entry.getByRole('button', { name: 'Change it here for now' }).click();
  await entry.getByRole('button', { name: 'Change it here for now' }).and(page.locator('[aria-expanded="true"]')).waitFor();
}

export const settingsDrivers: Record<string, Driver> = {
  // The menu lists every setting by its label under its category.
  'jump-menu': async (page) => {
    await openSettings(page);
    await page.getByRole('radiogroup', { name: 'Record with' }).waitFor();
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Jump menu' }).fill('microphone');
    await page.getByRole('option').first().waitFor();
  },
  'page-top': async (page) => {
    await openSettings(page);
    // The page has arrived once the first category's heading and its Record with radios are drawn.
    await page.getByRole('heading', { level: 2, name: 'Recording & DAW', exact: true }).waitFor();
    await page.getByRole('radiogroup', { name: 'Record with' }).waitFor();
    await page.getByRole('radio', { name: /^Built-in recorder/ }).waitFor();
  },

  // ---- Recording & DAW
  'recording-builtin': async (page) => {
    // The host refuses the built-in recorder while the Experimental switch is off, so this state turns it on.
    await openSettings(page, undefined, '?mockDawExperimentalOn=1');
    await page.getByRole('radio', { name: /^Built-in recorder/ }).click();
    // REAPER is linked, so the switch asks first.
    await page.getByRole('alertdialog', { name: 'Stop recording with REAPER?' }).getByRole('button', { name: 'Switch to the built-in recorder' }).click();
    await page
      .getByRole('radio', { name: /^Built-in recorder/ })
      .and(page.locator('[aria-checked="true"]'))
      .waitFor();
    await page.getByText('Recording happens in the app. Nothing to connect.').waitFor();
    await showConnection(page);
  },
  'recording-sample-output-daw': async (page) => {
    await openSettings(page);
    const row = await showSettingsRow(page, 'daw.sampleOutput');
    await row.getByText("Voice samples play on this computer's default output.", { exact: false }).waitFor();
  },
  'recording-sample-output-builtin': async (page) => {
    await openSampleOutput(page, 'usual', 'Headphones (Focusrite USB Audio)');
  },
  'recording-sample-output-long-name': async (page) => {
    // An interface that names itself at length, and one in Arabic with an emoji (the mock's `long` outputs): the row must stay inside its card at every width.
    await openSampleOutput(page, 'long', 'Realtek High Definition Audio (Digital Output Optical S/PDIF) via USB Audio CODEC Hub, port 3');
  },
  'recording-found': async (page) => {
    await openSettings(page, undefined, '?mockDawChoice=found');
    await page.getByRole('button', { name: 'Link Alice.rpp' }).waitFor();
    await showConnection(page);
  },
  'recording-several': async (page) => {
    await openSettings(page, undefined, '?mockDawChoice=several');
    await page.getByText(/2 REAPER project files are in the project folder/).waitFor();
    await showConnection(page);
  },
  'recording-linked': async (page) => {
    await openSettings(page, undefined, '?mockDawChoice=found');
    await page.getByRole('button', { name: 'Link Alice.rpp' }).click();
    await page.getByText('Linked to Alice.rpp.', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: 'Start REAPER' }).waitFor();
    await showConnection(page);
  },
  'recording-starting': async (page) => {
    await page.clock.setFixedTime(new Date('2026-10-23T09:30:00Z'));
    await openSettings(page, undefined, '?mockDawChoice=starting');
    await page.getByText('Starting REAPER').waitFor();
    await page.getByText(/Opened 4 s ago\./).waitFor();
    await showConnection(page);
  },
  'recording-builtin-confirm': async (page) => {
    await openSettings(page, undefined, '?mockDawExperimentalOn=1');
    await page.getByRole('radio', { name: /^Built-in recorder/ }).click();
    await page.getByRole('alertdialog', { name: 'Stop recording with REAPER?' }).waitFor();
  },
  'recording-not-installed': async (page) => {
    await openSettings(page, undefined, '?mockDawChoice=not-installed');
    await page
      .getByText(/REAPER was not found on this computer/)
      .first()
      .waitFor();
  },
  'recording-advanced': async (page) => {
    await openSettings(page, 'Recording & DAW');
    await openAdvanced(page);
    await page.getByRole('table', { name: 'What the recording tool can do' }).waitFor();
    await page.getByLabel('REAPER program', { exact: true }).waitFor();
  },
  'recording-sync-activity': async (page) => {
    await openSettings(page, 'Recording & DAW', '?mockChapterSync=activity');
    await openAdvanced(page);
    const row = await showSettingsRow(page, 'daw.syncActivity');
    await row.getByRole('button', { name: /^Undo: Linked/ }).waitFor();
  },
  'recording-reaper-path-invalid': async (page) => {
    await openSettings(page, 'Recording & DAW');
    await openAdvanced(page);
    const path = page.getByLabel('REAPER program', { exact: true });
    await path.fill('C:\\Program Files\\REAPER\\notes.txt');
    await path.press('Enter');
    await page.getByText('This is not the path to reaper.exe.', { exact: false }).waitFor();
    await showSettingsRow(page, 'daw.reaperPath');
  },

  // ---- Speech to text
  speech: async (page) => {
    await openSettings(page, 'Speech to text');
    await page.getByLabel('Transcription model (all projects)', { exact: true }).waitFor();
  },
  'speech-costly-confirm': async (page) => {
    await openSettings(page, 'Speech to text');
    await page.getByLabel('Transcription model (all projects)', { exact: true }).selectOption({ index: 1 });
    await confirmDialog(page, 'Change the transcription model?').waitFor();
  },
  'speech-advanced': async (page) => {
    await openSettings(page, 'Speech to text');
    await openAdvanced(page);
    await page.getByLabel('Chunk length (all projects)', { exact: true }).waitFor();
  },
  'speech-model-offer': async (page) => {
    // Booted without the downloads installed, so the model the row names is not on this computer and the row offers it.
    await openSettings(page, 'Speech to text', '?mockAssets=missing');
    await page
      .locator('[data-row="stt.model"] [data-asset-note]')
      .getByRole('button', { name: /^Download / })
      .waitFor();
  },

  // ---- Voice & pronunciation
  voice: async (page) => {
    await openSettings(page, 'Voice & pronunciation');
    await page.locator('[data-row="voice.id"] [data-asset-note]').waitFor();
    await page.getByRole('group', { name: 'Show definitions from' }).waitFor();
  },
  'voice-key-saved': async (page) => {
    await openSettings(page, 'Voice & pronunciation');
    await openAdvanced(page);
    await page.getByLabel('Merriam-Webster key', { exact: true }).fill('0b5c1a3e-7d2f-4e6a-9c8b-2f1e0d9c8b7a');
    await clickVisible(page, 'button', 'Save key');
    await page.getByText('Key saved', { exact: true }).waitFor();
    // The saved toast removes itself on a real timer, which would race the screenshot: dismiss it, unless a slow run already let it expire.
    const dismissToast = page.getByRole('button', { name: 'Dismiss message' });
    await dismissToast.click({ timeout: 1_000 }).catch(() => undefined);
    await dismissToast.waitFor({ state: 'detached' });
    await showSettingsRow(page, 'voice.mwKey');
  },

  // ---- Models & downloads
  models: async (page) => {
    await openModels(page);
  },
  'models-downloading': async (page) => {
    await openModels(page, '?mockAssets=installing');
    await page
      .getByRole('progressbar', { name: /^Downloading / })
      .first()
      .waitFor();
    await page
      .getByText(/44 of 109 MB|\d+%/)
      .first()
      .waitFor();
  },
  'models-failed': async (page) => {
    await openModels(page, '?mockAssets=download-fails');
    await page
      .locator('[data-asset="tts/en_US-ljspeech-high"]')
      .getByRole('button', { name: /^Download / })
      .click();
    await page.getByRole('alert').filter({ hasText: 'did not match the approved one' }).first().waitFor();
  },
  'models-needs-repair': async (page) => {
    await openModels(page, '?mockAssets=damaged');
    await page.getByRole('button', { name: 'Repair Small' }).waitFor();
  },
  'models-remove-confirm': async (page) => {
    await openModels(page);
    await page.locator(`[data-asset="${WHISPER_SMALL}"]`).getByRole('button', { name: 'Remove Small' }).click();
    await confirmDialog(page, 'Remove Small?').waitFor();
  },
  'models-remove-refused': async (page) => {
    await openModels(page);
    await page.locator(`[data-asset="${WHISPER_SMALL}"]`).getByRole('button', { name: 'Remove Small' }).click();
    await confirmDialog(page, 'Remove Small?').getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'was not removed' }).waitFor();
  },
  'models-empty': async (page) => {
    await openModels(page, '?mockAssets=missing');
    await page.getByText('Nothing is downloaded yet', { exact: true }).first().waitFor();
  },
  'models-loading': async (page) => {
    await openSettings(page, 'Models & downloads', '?mockAssetsList=loading');
    await page.getByLabel('Loading models and downloads').waitFor();
  },
  'models-error': async (page) => {
    await openSettings(page, 'Models & downloads', '?mockAssetsList=fails');
    await page.getByText('The list of models could not be read.').waitFor();
  },

  // ---- Delivery
  delivery: async (page) => {
    await openSettings(page, 'Delivery');
    await page.getByRole('combobox', { name: 'Delivery profile', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Default profile for new projects', exact: true }).waitFor();
  },
  'delivery-profile-editor': async (page) => {
    await openSettings(page, 'Delivery');
    await openAdvanced(page);
    await page.getByRole('button', { name: 'Duplicate ACX' }).click();
    await page
      .getByRole('button', { name: /^Edit / })
      .first()
      .click();
    const editor = page.getByRole('dialog', { name: 'Edit profile' });
    await editor.getByRole('textbox', { name: 'Peak, highest (dBFS)' }).fill('-3.5');
    await editor.getByText('Changed').waitFor();
  },
  'delivery-profile-custom': async (page) => {
    await openSettings(page, 'Delivery', '?mockDeliveryProfile=custom');
    const select = page.getByRole('combobox', { name: 'Delivery profile', exact: true });
    await select.getByRole('option', { name: 'My ACX, tighter peak', selected: true }).waitFor({ state: 'attached' });
  },

  // ---- Project
  project: async (page) => {
    await openSettings(page, 'Project');
    await page.getByText(/^Imported .* words$/).waitFor();
    await page.getByRole('button', { name: 'Replace manuscript…' }).waitFor();
  },
  manuscript: async (page) => {
    await openSettings(page, 'Project');
    await page.getByText(/^Imported .* words$/).waitFor();
    await clickVisible(page, 'button', 'Replace manuscript…');
    await clickVisible(page, 'button', 'Choose a file…');
    await confirmDialog(page, 'Import Alice.docx').waitFor();
  },
  'import-choose': async (page) => {
    await openSettings(page, 'Project');
    await page.getByText(/^Imported .* words$/).waitFor();
    await clickVisible(page, 'button', 'Replace manuscript…');
    await page.getByRole('heading', { name: 'Choose your manuscript' }).waitFor();
  },
  'marks-dialog': async (page) => {
    await openSettings(page, 'Project');
    await showSettingsRow(page, 'project.marks');
    await page.getByRole('button', { name: 'Edit marks…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Define how you mark up' });
    await dialog.waitFor();
    await dialog.getByLabel('Mark name').first().waitFor();
  },
  'project-credits': async (page) => {
    await openCreditsEditor(page);
  },
  // The chapter announcement template ?mockCredits=extras adds, previewed for Chapter 1.
  'project-credits-chapter-announcement': async (page) => {
    await openCreditsEditor(page, '?mockCredits=extras');
    await page.getByRole('combobox', { name: 'Template' }).selectOption({ label: 'Chapter announcement' });
    await page.getByText(/Shown for Chapter 1/).waitFor();
  },
  // The retail sample ?mockCredits=extras picked (Chapter 3, lines 1-3), scrolled into view.
  'project-credits-retail-sample': async (page) => {
    await openCreditsEditor(page, '?mockCredits=extras');
    await page.getByText(/Chapter 3: A Caucus-Race and a Long Tale, lines 1 to 3/).waitFor();
    await page.getByRole('heading', { name: 'Retail sample' }).scrollIntoViewIfNeeded();
  },
  // A range over 5 minutes (Chapter 1 to Chapter 12) is refused, and the refusal says why.
  'project-credits-retail-sample-refused': async (page) => {
    await openCreditsEditor(page);
    await page.getByRole('combobox', { name: 'Sample ends in' }).selectOption({ label: 'Chapter 12: Alice’s Evidence' });
    await page.getByRole('button', { name: 'Save sample' }).click();
    await page.getByText(/at most 5 minutes/).waitFor();
    await page.getByRole('button', { name: 'Save sample' }).scrollIntoViewIfNeeded();
  },
  'project-data-confirm': async (page) => {
    await openSettings(page, 'Project');
    await openAdvanced(page);
    await page.getByRole('button', { name: 'Clear derived data…' }).click();
    await confirmDialog(page, 'Clear derived project data?').waitFor();
  },

  // ---- Appearance & keys
  appearance: async (page) => {
    await openSettings(page, 'Appearance & keys');
    await page.getByRole('radiogroup', { name: 'Theme' }).waitFor();
  },
  'reader-text': async (page) => {
    await openSettings(page, 'Appearance & keys');
    await showSettingsRow(page, 'look.reader');
    await page.getByRole('slider', { name: 'Column width' }).waitFor();
  },
  'global-keyboard': async (page) => {
    await openShortcuts(page);
    await page.getByRole('button', { name: 'Reset all to defaults' }).waitFor();
  },
  'global-keyboard-recording': async (page) => {
    await openShortcuts(page);
    await openKeyboardRecorder(page, 'Record or stop');
    await page.keyboard.press('KeyJ');
    await page.getByText('J captured. No other command uses it where reading happens.').waitFor();
  },
  'global-keyboard-conflict': async (page) => {
    await openShortcuts(page);
    await openKeyboardRecorder(page, 'Next paragraph');
    // ArrowRight is already "Next word"'s default, both `page` scope: a real findConflicts collision.
    await page.keyboard.press('ArrowRight');
    await page.getByText('→ already runs "Next word".').waitFor();
  },

  // ---- App & updates
  app: async (page) => {
    await openSettings(page, 'App & updates');
    await page.getByText('Not checked yet.').waitFor();
  },
  'about-update-available': async (page) => {
    await openUpdates(page, 'available');
    await page.getByText('Version 0.2.7 is available').waitFor();
  },
  'about-download-confirm': async (page) => {
    await openUpdates(page, 'available');
    await page.getByRole('button', { name: 'Download update' }).click();
    await confirmDialog(page, 'Download version 0.2.7?').waitFor();
  },
  'about-download-progress': async (page) => {
    await openUpdates(page, 'downloading');
    await startUpdateDownload(page);
    await page.getByRole('dialog', { name: `Download ${brand.name} 0.2.7` }).waitFor();
    await page
      .getByText(/160 of 400 MB/)
      .first()
      .waitFor();
  },
  'about-download-failed': async (page) => {
    await openUpdates(page, 'download-fails');
    await startUpdateDownload(page);
    await page.getByRole('alert').filter({ hasText: 'so the update was not used' }).waitFor();
  },
  'about-update-ready': async (page) => {
    await openUpdates(page, 'ready');
    await page.getByRole('button', { name: 'Install and restart' }).waitFor();
  },
  'about-install-confirm': async (page) => {
    await openUpdates(page, 'ready');
    await page.getByRole('button', { name: 'Install and restart' }).click();
    await confirmDialog(page, 'Install version 0.2.7 and restart?').waitFor();
  },
  'about-installing': async (page) => {
    await openUpdates(page, 'ready');
    await page.getByRole('button', { name: 'Install and restart' }).click();
    await confirmDialog(page, 'Install version 0.2.7 and restart?').getByRole('button', { name: 'Install and restart' }).click();
    await page.getByRole('dialog', { name: `Installing ${brand.name} 0.2.7` }).waitFor();
  },
  'about-install-refused': async (page) => {
    await openUpdates(page, 'install-refused');
    await page.getByRole('button', { name: 'Install and restart' }).click();
    await confirmDialog(page, 'Install version 0.2.7 and restart?').getByRole('button', { name: 'Install and restart' }).click();
    await page.getByRole('alert').filter({ hasText: 'The app is busy' }).waitFor();
  },
  'about-install-blocked': async (page) => {
    await openUpdates(page, 'install-blocked');
    await startUpdateDownload(page);
    await page.getByRole('button', { name: 'Close' }).waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Show the downloaded file' }).waitFor();
  },
  'about-development-build': async (page) => {
    await openUpdates(page, 'development');
    await page.getByText('A development build is never offered an update.').waitFor();
  },
  'about-check-failed': async (page) => {
    await openUpdates(page, 'failed');
    await page.getByText('Could not reach GitHub to check for updates.').waitFor();
  },

  // ---- Set on a page
  pages: async (page) => {
    await openSettings(page, 'Set on a page');
    await page.locator('[data-page-setting="ps.coverage"]').waitFor();
  },
  'pages-panel-open': async (page) => {
    await openFirstPagePanel(page);
    await page.locator('[data-page-setting="ps.coverage"]').scrollIntoViewIfNeeded();
  },

  'pages-navigate-away-confirm': async (page) => {
    // A panel kept behind Set on a page still edits with Save, so leaving with a change in it asks first.
    await openFirstPagePanel(page);
    await page.getByLabel('Share of each paragraph that must be read', { exact: false }).first().fill('0.7');
    // Leaving with unsaved changes asks first, so this click does not arrive at Production: it opens the confirm dialog.
    await clickNav(page, 'Production');
    await confirmDialog(page, 'Unsaved settings').waitFor();
  },

  // ---- Search and filters
  'search-results': async (page) => {
    await openSettings(page);
    await page.getByRole('textbox', { name: 'Search settings' }).fill('whisper');
    await page.getByText(/\d+ settings? found/).waitFor();
  },
  'search-empty': async (page) => {
    await openSettings(page);
    await page.getByRole('textbox', { name: 'Search settings' }).fill('zzzz');
    await page.getByText('No settings match “zzzz”').waitFor();
  },
  'filter-changed': async (page) => {
    await openSettings(page, 'App & updates');
    // Turning a setting off is a change from its default; the filter then lists exactly that row.
    await page.getByRole('switch', { name: /Tell me when a long task finishes/ }).click();
    await page.locator('[data-row="app.notify"][data-changed="true"]').waitFor();
    await page
      .getByRole('radio', { name: 'Changed', exact: true })
      .or(page.getByRole('button', { name: 'Changed', exact: true }))
      .first()
      .click();
    await page.getByRole('region', { name: 'App & updates' }).locator('[data-row="app.notify"]').waitFor();
  },
  'filter-project': async (page) => {
    await openSettings(page);
    await page
      .getByRole('radio', { name: 'In this project', exact: true })
      .or(page.getByRole('button', { name: 'In this project', exact: true }))
      .first()
      .click();
    await page.getByText(/\d+ settings? found/).waitFor();
  },

  // ---- Arriving
  'deep-link': async (page) => {
    // From the Booth's credits notice, which links to /settings#credits. The row's light fades on a real 2.2 s timer, so the clock stops
    // before the link is followed.
    await page.goto('/booth?mockRecordCapabilityOn=1&credits=closing');
    await settlePage(page);
    await page.getByRole('button', { name: /Fill them in Settings$/ }).waitFor();
    await freezeClock(page);
    await page.getByRole('button', { name: /Fill them in Settings$/ }).click();
    await page.getByRole('heading', { level: 1, name: 'Settings', exact: true }).waitFor();
    await page.getByRole('button', { name: /^Back to Booth/ }).waitFor();
    await page.locator('[data-row="project.credits"]').waitFor();
  },
  'folded-category-list': async (page) => {
    await openSettings(page);
    // Narrower than 760 px the list is folded behind the Category button, which names the current category; open it.
    const folded = page.getByRole('button', { name: /^Category/ });
    if (await folded.isVisible()) {
      await folded.click();
      await folded.and(page.locator('[aria-expanded="true"]')).waitFor();
    }
  },

  // ---- States of the page
  loading: async (page) => {
    await openSettings(page, undefined, '?mockSettings=loading');
    await page.getByLabel('Loading Recording & DAW').waitFor();
  },
  unreadable: async (page) => {
    await openSettings(page, undefined, '?mockSettings=unreadable');
    await page.getByRole('alert').filter({ hasText: 'Your settings could not be read.' }).waitFor();
  },
  'save-failed': async (page) => {
    await openSettings(page, 'App & updates', '?mockSettings=save-fails');
    await page.getByRole('switch', { name: /Tell me when a long task finishes/ }).click();
    await page.getByText('Changes cannot be saved right now.').waitFor();
    await page.locator('[data-row="app.notify"]').getByText('The settings file is read-only.').waitFor();
  },
  override: async (page) => {
    await openSettings(page, 'Project');
    await showSettingsRow(page, 'project.build');
    await page.getByRole('button', { name: 'Override for this project: Build the Story Bible after import' }).click();
    await page.getByText('This project uses', { exact: true }).waitFor();
  },
};
// The whole page of page-top (catalog/shared.ts: wholePage), driven the same way.
settingsDrivers['whole-page'] = settingsDrivers['page-top'];
