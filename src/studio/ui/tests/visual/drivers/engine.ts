// How to reach each `engine` state in STATE_CATALOG (see app.drivers.ts): the engine panel, opened from the header's engine chip,
// and the REAPER tools' dialogs opened from it.
import { settlePage } from '../helpers/settle';
import { type Driver, clickVisible, openAdvanced, openEditingCheckFromEngine, openEnginePanel, openSettings, showSettingsRow } from './shared';

export const engineDrivers: Record<string, Driver> = {
  default: async (page) => {
    await openEnginePanel(page);
    await page.getByRole('table', { name: 'Chapter links' }).waitFor();
  },
  'from-tracks-link': async (page) => {
    await page.goto('/tracks');
    await settlePage(page);
    // Proof's notes, behind the modal panel (so out of the accessibility tree, hence the CSS locator), have arrived too.
    await page.locator('table[aria-label="Notes"] tbody tr[data-row]').first().waitFor();
    await page.getByRole('dialog', { name: 'Audio engine' }).getByRole('table', { name: 'Tracks' }).waitFor();
  },
  'sync-off': async (page) => {
    await page.goto('/?mockChapterSync=off');
    await settlePage(page);
    await openEnginePanel(page);
    await page.getByText('Chapter sync is off.').waitFor();
  },
  'sync-background-wait': async (page) => {
    await page.goto('/?mockChapterSync=background');
    await settlePage(page);
    await openEnginePanel(page);
    await page.getByText(/Waiting: REAPER is recording/).waitFor();
  },
  // Chapter sync's "Needs you" list: undoing an automatic link in the sync activity log (Settings > Recording & DAW > Advanced) leaves that
  // chapter for the narrator to link, and no seed starts there.
  'sync-needs-you': async (page) => {
    await openSettings(page, 'Recording & DAW', '?mockChapterSync=activity');
    await openAdvanced(page);
    const row = await showSettingsRow(page, 'daw.syncActivity');
    await row
      .getByRole('button', { name: /^Undo: Linked/ })
      .first()
      .click();
    await openEnginePanel(page);
    await page.getByRole('heading', { name: /^Needs you \(\d+\)$/ }).waitFor();
    // The undo answers with "Link undone." over the Tracks table: the picture is the panel.
    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await page.locator('[data-tone]').first().waitFor({ state: 'detached' });
  },
  // An Audacity project: its card replaces the REAPER project section.
  'audacity-linked': async (page) => {
    await page.goto('/?mockAudacityLink=linked');
    await settlePage(page);
    await openEnginePanel(page, 'Audacity');
    await page.getByText("Audacity is open and answering, with this project's Audacity project.").waitFor();
    await page.getByText(/, from Book One\.aup3 in Audacity$/).waitFor();
  },
  'audacity-not-running': async (page) => {
    await page.goto('/?mockAudacityLink=not-running');
    await settlePage(page);
    await openEnginePanel(page, 'Audacity');
    await page.getByText('Audacity is not running. Start it here and the app connects.').waitFor();
  },
  'rpp-picker': async (page) => {
    // Reload with the mock's two-.rpp seam (see main.tsx) - the outer
    // loop's default page.goto('/') has already happened by now.
    await page.goto('/?mockMultipleRpp=1');
    await settlePage(page);
    await openEnginePanel(page);
    await page.getByRole('list', { name: 'REAPER project files' }).waitFor();
  },
  'no-rpp': async (page) => {
    await page.goto('/?mockNoRpp=1');
    await settlePage(page);
    await openEnginePanel(page);
    await page.getByText('No REAPER project file found').waitFor();
  },
  'no-daw-link': async (page) => {
    // Reload with the mock's no-linked-DAW seam (see main.tsx): the panel still reads its own .rpp discovery, but its
    // own DAW-link control switches from "Change file…" to "Link file…".
    await page.goto('/?mockNoDaw=1');
    await settlePage(page);
    await openEnginePanel(page);
    await page.getByRole('button', { name: 'Link a project file' }).waitFor();
  },
  'wrong-project': async (page) => {
    // The mock's live heartbeat whose open project disagrees with the linked file (see main.tsx): the card says when it last checked.
    await page.goto('/?mockDawMismatch=1');
    await settlePage(page);
    await openEnginePanel(page);
    const card = page.getByRole('region', { name: 'REAPER project' });
    await card.getByText(/Last checked \d+ s ago/).waitFor();
    await card.getByRole('button', { name: 'Check again' }).waitFor();
  },
  'voice-folders': async (page) => {
    await page.goto('/?mockVoiceFolders=1');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: /^Voices of / });
    await table.getByRole('row', { name: /Extras/ }).waitFor();
    await table.scrollIntoViewIfNeeded();
  },
  'voice-folders-picker': async (page) => {
    await page.goto('/?mockVoiceFolders=1');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: /^Voices of / });
    await table.getByRole('row', { name: /Extras/ }).waitFor();
    await table.scrollIntoViewIfNeeded();
    await table.getByRole('button', { name: 'Choose who the Extras track records' }).click();
    await page
      .getByRole('dialog', { name: 'Choose who the Extras track records' })
      .getByRole('checkbox', { name: /Cheshire Cat/ })
      .waitFor();
  },
  'voice-folders-sync': async (page) => {
    await page.goto('/?mockVoiceFolders=1');
    await settlePage(page);
    await openEnginePanel(page);
    const layout = page.getByRole('group', { name: 'Chapter layout' });
    await layout.waitFor();
    await layout.evaluate((node) => node.closest('section, [data-panel], div')?.scrollIntoView({ block: 'start' }));
    await page
      .getByRole('treegrid', { name: 'Tracks' })
      .getByRole('row', { name: /Extras/ })
      .waitFor();
  },
  'voice-folders-links': async (page) => {
    await page.goto('/?mockVoiceFolders=1');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: 'Chapter links' });
    await table.getByText('Chapter 1 · 3 voices').waitFor();
    await table.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  },
  'nested-chapters': async (page) => {
    await page.goto('/?mockNestedChapters=1');
    await settlePage(page);
    await openEnginePanel(page);
    const move = page.getByRole('button', { name: 'Move them out…' });
    await move.waitFor();
    await move.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  },
  'nested-chapters-confirm': async (page) => {
    await page.goto('/?mockNestedChapters=1');
    await settlePage(page);
    await openEnginePanel(page);
    await page.getByRole('button', { name: 'Move them out…' }).click();
    await page.getByRole('alertdialog').getByRole('list', { name: 'Tracks that move' }).waitFor();
  },
  'voice-folders-link-picker': async (page) => {
    await page.goto('/?mockVoiceFolders=1&mockChapterLink=confirmed');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: 'Chapter links' });
    const trigger = table.getByRole('button', { name: /^Folder for Chapter 2/ });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await page.getByRole('treeitem', { name: /White Rabbit/ }).waitFor();
  },
  'folder-tracks': async (page) => {
    await page.goto('/?mockTrackFolders=1');
    await settlePage(page);
    await openEnginePanel(page);
    const tree = page.getByRole('treegrid', { name: 'Tracks' });
    await tree.scrollIntoViewIfNeeded();
    await tree.getByRole('row', { name: /Narration/ }).waitFor();
  },
  'folder-tracks-picker': async (page) => {
    await page.goto('/?mockTrackFolders=1&mockChapterLink=none');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: 'Chapter links' });
    await table.scrollIntoViewIfNeeded();
    await table
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: /^Track for / })
      .click();
    await page.getByRole('tree').first().waitFor();
  },
  'folder-tracks-picker-search': async (page) => {
    await page.goto('/?mockTrackFolders=1');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: 'Chapter links' });
    await table.scrollIntoViewIfNeeded();
    // The fifth body row is Chapter 4, the first chapter with no link at boot (the ticked chapters 1-3 and 7-10 boot linked).
    await table
      .locator('tbody tr')
      .nth(4)
      .getByRole('button', { name: /^Track for / })
      .click();
    await page.getByRole('textbox', { name: 'Search tracks' }).last().fill('chap');
    await page.getByRole('treeitem', { name: /linked to Chapter 1\b/ }).waitFor();
  },
  'chapter-link-confirmed': async (page) => {
    // Boots with no link, so the click through Confirm below is what makes it (an unset seed boots Chapter 1 already linked).
    await page.goto('/?mockChapterLink=none');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: 'Chapter links' });
    await table.scrollIntoViewIfNeeded();
    // The first body row, by position: filtering by "has a combobox" would stop matching this same row the
    // instant Confirm turns it into the linked view (no combobox), so `waitFor` below would wait forever.
    const firstRow = table.locator('tbody tr').first();
    await firstRow.getByRole('combobox').selectOption({ index: 1 });
    await firstRow.getByRole('button', { name: 'Confirm' }).click();
    await firstRow.getByRole('button', { name: 'Change the track' }).waitFor();
  },
  'chapter-track-created': async (page) => {
    await page.goto('/?mockChapterLink=none');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: 'Chapter links' });
    await table.scrollIntoViewIfNeeded();
    // By position: the row stops matching a "has a create button" filter the moment it is linked. The second body row is Chapter 1 (the
    // opening credits come first).
    const chapterRow = table.locator('tbody tr').nth(1);
    await chapterRow.getByRole('button', { name: /^Create a track for Chapter 1/ }).click();
    await chapterRow.getByRole('button', { name: 'Change' }).waitFor();
    await page
      .getByText(/^Created the track “/)
      .first()
      .waitFor();
  },
  'chapter-folder-created': async (page) => {
    await page.goto('/?mockVoiceFolders=1');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: 'Chapter links' });
    await table.scrollIntoViewIfNeeded();
    // The first chapter (not the credits) with no link: its button goes once the row is linked to the new folder.
    const button = table.getByRole('button', { name: /^Create a folder for Chapter/ }).first();
    const label = (await button.getAttribute('aria-label')) ?? '';
    await button.click();
    await table.getByRole('button', { name: label, exact: true }).waitFor({ state: 'detached' });
    await table
      .getByText(/ · 1 voice$/)
      .first()
      .waitFor();
    await page
      .getByText(/^Created the folder “/)
      .first()
      .waitFor();
  },
  'chapter-track-create-refused': async (page) => {
    await page.goto('/?mockReaperState=recording_elsewhere&mockChapterLink=none');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: 'Chapter links' });
    await table.scrollIntoViewIfNeeded();
    await table
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: /^Create a track for / })
      .click();
    await page.getByText('REAPER is recording. Stop the take, then create the track.').first().waitFor();
  },
  'live-tracks-saved': async (page) => {
    // The mock's seam for REAPER not answering (see main.tsx): Chapter links' header says the tracks are the saved project's and why.
    await page.goto('/?mockLiveTracks=saved');
    await settlePage(page);
    const panel = await openEnginePanel(page);
    const links = panel.getByRole('region', { name: 'Chapter links' });
    await links.scrollIntoViewIfNeeded();
    await links.getByText(/^Saved project · read \d+ s ago$/).waitFor();
  },
  'live-tracks-stale': async (page) => {
    // The mock answers the first live read and refuses every later one (see main.tsx): Refresh fails, the header says it can't tell and
    // when it last read the tracks, and the failure is a toast.
    await page.goto('/?mockLiveTracks=failing');
    await settlePage(page);
    const panel = await openEnginePanel(page);
    const links = panel.getByRole('region', { name: 'Chapter links' });
    await links.scrollIntoViewIfNeeded();
    await links.getByText(/^REAPER now · read \d+ s ago$/).waitFor();
    await links.getByRole('button', { name: 'Read the tracks from REAPER again' }).click();
    await links.getByText(/^REAPER did not answer · last read \d+ s ago$/).waitFor();
    await page.getByText('REAPER did not answer in time.').first().waitFor();
  },
  'chapter-link-missing': async (page) => {
    // Reload with the mock's missing-track seam (see main.tsx): a confirmed link whose
    // trackGuid is not among the mock project's tracks.
    await page.goto('/?mockChapterLink=missing');
    await settlePage(page);
    await openEnginePanel(page);
    const table = page.getByRole('table', { name: 'Chapter links' });
    await table.scrollIntoViewIfNeeded();
    await table.getByText('Track missing').waitFor();
  },
  'editing-check-unmapped': async (page) => {
    const panel = await openEditingCheckFromEngine(page, 'mockEditingRefusal=unmapped');
    await clickVisible(page, 'button', 'Check editing');
    await panel.getByText('This chapter can’t be checked yet').waitFor();
  },
  'link-chapters-track-folders': async (page) => {
    await page.goto('/?mockTrackFolders=1');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Link chapters to tracks');
    await page.getByRole('combobox', { name: 'Track for Chapter 1', exact: true }).selectOption({ label: 'Chapters · 8 tracks' });
    await page
      .getByText(/the folder also holds another chapter's linked track/)
      .first()
      .scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /^Stamp \d+ items?$/ }).waitFor();
  },
  'link-chapters-preview': async (page) => {
    await page.goto('/?mockChapterLink=none');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Link chapters to tracks');
    await page.getByRole('combobox', { name: 'Track for Chapter 1', exact: true }).selectOption({ label: 'Chapter 1' });
    await page.getByRole('button', { name: /^Stamp \d+ items?$/ }).waitFor();
  },
  'link-chapters-success': async (page) => {
    await page.goto('/?mockLineIdentity=success');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Link chapters to tracks');
    const message = page.getByText('Read 5 stamped items.');
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
  'link-chapters-conflict': async (page) => {
    await page.goto('/?mockLineIdentity=conflict');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Link chapters to tracks');
    const message = page.getByText(/Stamped 1 item, 1 stale item, 1 conflict\./);
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
  'link-chapters-error': async (page) => {
    await page.goto('/?mockLineIdentity=error');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Link chapters to tracks');
    const message = page.getByText(/app’s script/).first();
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
  'render-config-prefilled': async (page) => {
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Prepare the chapter render');
    await page.getByRole('button', { name: 'Configure render' }).waitFor();
  },
  'render-config-success': async (page) => {
    await page.goto('/?mockRenderConfig=success');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Prepare the chapter render');
    const message = page.getByText(/Render is configured/);
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
  'render-config-no-regions': async (page) => {
    await page.goto('/?mockRenderConfig=no-regions');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Prepare the chapter render');
    const message = page.getByText(/No chapter regions were found yet/);
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
  'render-config-error': async (page) => {
    await page.goto('/?mockRenderConfig=error');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Prepare the chapter render');
    const message = page.getByText(/cannot configure render settings/).first();
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
  'create-regions-empty': async (page) => {
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Create chapter regions');
    await page
      .getByText(/No track is linked to this chapter\./)
      .first()
      .waitFor();
  },
  'create-regions-preview': async (page) => {
    await page.goto('/?mockChapterLink=confirmed');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Create chapter regions');
    await page.getByRole('combobox', { name: 'Opening credits track' }).selectOption({ label: 'Chapter 2' });
    await page.getByRole('button', { name: 'Create 2 regions' }).waitFor();
  },
  'create-regions-success': async (page) => {
    await page.goto('/?mockChapterLink=confirmed');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Create chapter regions');
    await page.getByRole('combobox', { name: 'Opening credits track' }).selectOption({ label: 'Chapter 2' });
    await clickVisible(page, 'button', 'Create 2 regions');
    const message = page.getByText(/^Sent 2:/);
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
  'create-regions-error': async (page) => {
    await page.goto('/?mockChapterLink=confirmed&mockRegionsCreateError=1');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Create chapter regions');
    await clickVisible(page, 'button', 'Create 1 region');
    const message = page.getByText(/REAPER refused to write the regions/).first();
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
  'cleanup-tools-idle': async (page) => {
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Open the cleanup tools');
    await page.getByRole('button', { name: 'Open Magnolius DeClick' }).waitFor();
  },
  'cleanup-tools-launched': async (page) => {
    await page.goto('/?mockCleanupTools=launched');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Open the cleanup tools');
    const message = page.getByText(/is open in REAPER/);
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
  'cleanup-tools-error': async (page) => {
    await page.goto('/?mockCleanupTools=error');
    await settlePage(page);
    await openEnginePanel(page);
    await clickVisible(page, 'button', 'Open the cleanup tools');
    const message = page.getByText(/Magnolius DeClick is not installed/).first();
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
};
