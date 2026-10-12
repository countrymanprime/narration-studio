// How to reach each `delivery` state in STATE_CATALOG (see app.drivers.ts).
import { settlePage } from '../helpers/settle';
import { type Driver, goToPage, openMaster, panelTitled, pickFilesToMaster, scrollToTop } from './shared';

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
  built: async (page) => {
    await page.goto('/?mockMeasure=spread');
    await settlePage(page);
    await openMaster(page);
    await pickFilesToMaster(page);
    await page.getByRole('button', { name: 'Master & encode' }).click();
    await page
      .getByRole('region', { name: 'Master to spec' })
      .getByText(/^Prepared 5 files\./)
      .waitFor({ timeout: 15_000 });
    await openDelivery(page);
    await page.getByRole('button', { name: /^Build .* package$/ }).click();
    await panelTitled(page, 'Output').getByText('Built', { exact: true }).waitFor({ timeout: 15_000 });
    // The jobs' ends raise toasts (job:ended, ADR 0076) that would cover the page; dismiss them.
    const dismiss = page.getByRole('button', { name: 'Dismiss message' });
    while ((await dismiss.count()) > 0) await dismiss.first().click();
  },
  'no-manuscript': async (page) => {
    await page.goto('/delivery?mockNoManuscript');
    await settlePage(page);
    await page.getByText(/^Add the manuscript first/).waitFor();
  },
};
