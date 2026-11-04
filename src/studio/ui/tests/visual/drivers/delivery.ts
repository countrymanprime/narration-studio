// How to reach each `delivery` state in STATE_CATALOG (see app.drivers.ts).
import { settlePage } from '../helpers/settle';
import { type Driver, goToPage, measureOnMaster, measurementEnded, panelTitled, scrollToTop } from './shared';

// Opens Delivery through the rail (after a reload with mock seams, when given) once the profile card and the chapters are read.
async function openDelivery(page: Parameters<Driver>[0], query = ''): Promise<void> {
  if (query) {
    await page.goto(`/${query}`);
    await settlePage(page);
  }
  await goToPage(page, 'Delivery');
  await panelTitled(page, 'Before you build')
    .getByText(/passing/)
    .waitFor();
}

const buildButton = (page: Parameters<Driver>[0]) => page.getByRole('button', { name: /^Build .* package$/ });

// Opens Delivery booted with everything passing and encoded, and waits for Build to be on.
async function openReady(page: Parameters<Driver>[0], seed: string): Promise<void> {
  await openDelivery(page, `?mockDelivery=${seed}`);
  await page.getByText('Every chapter passes.').waitFor();
}

// Opens the Embed chapter tags dialog from Delivery's Output panel.
async function embedChapterTags(page: Parameters<Driver>[0]): Promise<void> {
  await page.getByRole('button', { name: 'Embed chapter tags in the book MP3' }).click();
  await page.getByRole('dialog', { name: 'Embed chapter tags' }).waitFor();
}

// Fills the destination and the confirmation, then embeds.
async function fillEmbed(page: Parameters<Driver>[0]): Promise<void> {
  await page.getByLabel('Combined book MP3 to add chapters to').fill('C:\\Books\\Alice\\Alice in Wonderland.mp3');
  await page.getByRole('checkbox', { name: /I understand this writes a new file/ }).click();
  await page.getByRole('dialog', { name: 'Embed chapter tags' }).getByRole('button', { name: 'Embed chapter tags', exact: true }).click();
}

export const deliveryDrivers: Record<string, Driver> = {
  // Embed chapter tags (#2829): the dialog opened from the Output panel's button, whatever the build says.
  'chapter-tags-idle': async (page) => {
    await openDelivery(page);
    await embedChapterTags(page);
    await page.getByText(/No chapter render is configured yet/).waitFor();
  },
  'chapter-tags-ready': async (page) => {
    await openDelivery(page, '?mockChapterTags=ready');
    await embedChapterTags(page);
    await page.getByRole('dialog', { name: 'Embed chapter tags' }).getByText('Chapter 2').waitFor();
  },
  'chapter-tags-not-rendered': async (page) => {
    await openDelivery(page, '?mockChapterTags=not-rendered');
    await embedChapterTags(page);
    await page.getByText('Not rendered yet', { exact: true }).waitFor();
  },
  'chapter-tags-success': async (page) => {
    await openDelivery(page, '?mockChapterTags=ready');
    await embedChapterTags(page);
    await fillEmbed(page);
    await page.getByText(/^Wrote /).waitFor();
  },
  'chapter-tags-error': async (page) => {
    await openDelivery(page, '?mockChapterTags=ready&mockChapterTagsEmbedError=1');
    await embedChapterTags(page);
    await fillEmbed(page);
    const message = page.getByText(/could not write chapter tags/).first();
    await message.waitFor();
    await message.scrollIntoViewIfNeeded();
  },
  // The chapters never answer, so `openDelivery` (which waits for the chapter counts) is not used.
  loading: async (page) => {
    await page.goto('/?mockChapters=loading');
    await settlePage(page);
    await goToPage(page, 'Delivery');
    await page.getByRole('group', { name: 'Loading the chapter checks' }).waitFor();
  },
  default: async (page) => {
    await openDelivery(page);
  },
  measured: async (page) => {
    await openDelivery(page, '?mockMeasure=spread');
  },
  'failing-chapter': async (page) => {
    await measureOnMaster(page);
    await measurementEnded(page, /^Measured 2 of 3 files; 1 could not be measured\./);
    await goToPage(page, 'Delivery');
    await page.getByText(/^Chapter 1 — Down the Rabbit-Hole: sample rate 48 kHz \(limit 44\.1 kHz\)\.$/).waitFor();
  },
  'many-chapters': async (page) => {
    // Open Delivery's own address instead of reloading at `/` and clicking through the rail: Production, the landing page,
    // lists every chapter with a tooltip each (about 40,000 window listeners at 5002 chapters, a quadratic cost), and a main
    // thread busy for a minute starved the rail click and, on a loaded shard, axe's evaluate until the 90 s test timeout.
    await page.goto('/delivery?mockBooth=many-chapters');
    await settlePage(page);
    await panelTitled(page, 'Before you build')
      .getByText(/passing/)
      .waitFor();
    await page.getByRole('button', { name: /^Show the other \d+ chapters$/ }).waitFor();
  },
  'custom-profile': async (page) => {
    await openDelivery(page, '?mockDeliveryProfile=custom');
    await page.getByRole('textbox', { name: 'Profile name' }).waitFor();
  },
  'profile-rules': async (page) => {
    await openDelivery(page);
    await page.getByRole('button', { name: /^Rules and their sources/ }).click();
    await page.getByRole('table', { name: 'Rules and their sources' }).waitFor();
    await scrollToTop(page, panelTitled(page, 'Profile rules'));
  },
  ready: async (page) => {
    await openReady(page, 'ready');
  },
  built: async (page) => {
    await openReady(page, 'ready');
    await buildButton(page).click();
    await page.getByText('Written').first().waitFor();
    await scrollToTop(page, panelTitled(page, 'Output'));
  },
  building: async (page) => {
    await openReady(page, 'building');
    await buildButton(page).click();
    await page.getByRole('button', { name: 'Cancel' }).waitFor();
  },
  'build-failed': async (page) => {
    await openReady(page, 'fails');
    await buildButton(page).click();
    await page.getByRole('alert').filter({ hasText: 'access is denied' }).waitFor();
  },
  'host-quiet': async (page) => {
    await openReady(page, 'quiet');
    await buildButton(page).click();
    await page.getByRole('alert').filter({ hasText: "Can't tell how the build is going" }).waitFor();
    await page.getByText('Every chapter passes.').waitFor({ state: 'hidden' });
  },
  'host-quiet-cancelled': async (page) => {
    await openReady(page, 'quiet');
    await buildButton(page).click();
    const quiet = page.getByRole('alert').filter({ hasText: "Can't tell how the build is going" });
    await quiet.waitFor();
    // The quiet host is an error toast with Retry; a press reads again and the toast comes back while the host is still quiet.
    await quiet.getByRole('button', { name: 'Retry' }).click();
    await quiet.waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByText('Cancel was sent, but the host did not confirm it, so the build may still be running.').waitFor();
    // At 1024x768 the two sentences sit under the fold, so the capture would equal host-quiet's: bring Output to the top.
    await scrollToTop(page, panelTitled(page, 'Output'));
  },
  'no-manuscript': async (page) => {
    await page.goto('/delivery?mockNoManuscript');
    await settlePage(page);
    await page.getByText('This project has no manuscript yet. Import one to begin.').waitFor();
  },
};
// The whole page of measured (catalog/shared.ts: wholePage), driven the same way.
deliveryDrivers['whole-page'] = deliveryDrivers['measured'];
