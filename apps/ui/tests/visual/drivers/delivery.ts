// How to reach each `delivery` state in STATE_CATALOG (see app.drivers.ts).
import { settlePage } from '../helpers/settle';
import { type Driver, goToPage, panelTitled, scrollToTop } from './shared';

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

export const deliveryDrivers: Record<string, Driver> = {
  default: async (page) => {
    await openDelivery(page);
  },
  measured: async (page) => {
    await openDelivery(page, '?mockMeasure=spread');
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
    await page.getByRole('alert').filter({ hasText: 'could not be built' }).waitFor();
  },
  'host-quiet': async (page) => {
    await openReady(page, 'quiet');
    await buildButton(page).click();
    await page.getByRole('alert').filter({ hasText: "Can't tell how the build is going" }).waitFor();
  },
  'no-manuscript': async (page) => {
    await page.goto('/delivery?mockNoManuscript');
    await settlePage(page);
    await page.getByText('This project has no manuscript yet. Import one to begin.').waitFor();
  },
};
