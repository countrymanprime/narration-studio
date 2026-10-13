// How to reach each `schedule` state in STATE_CATALOG (see app.drivers.ts).
import { settlePage } from '../helpers/settle';
import { type Driver, clickNav, clickVisible, confirmDialog, openWithoutManuscript } from './shared';

// Opens the Schedule through the rail, optionally booted with a mock seed (main.tsx), and waits until the plan has been read.
async function openSchedule(page: Parameters<Driver>[0], query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await settlePage(page);
  await clickNav(page, 'Schedule');
  await page.getByRole('heading', { level: 2, name: 'Milestones' }).waitFor();
}

export const scheduleDrivers: Record<string, Driver> = {
  'no-due-date': async (page) => {
    await openSchedule(page);
    await page.getByText('No due date set').first().waitFor();
  },
  'on-pace': async (page) => {
    await openSchedule(page, '?mockProduction=on-pace');
    await page.getByText(/days left/).waitFor();
  },
  'at-risk': async (page) => {
    await openSchedule(page, '?mockProduction=at-risk');
    await page.getByText(/days left/).waitFor();
  },
  'milestone-dialog': async (page) => {
    await openSchedule(page);
    await clickVisible(page, 'button', 'Add milestone');
    await confirmDialog(page, /milestone/i).waitFor();
  },
  'no-manuscript': async (page) => {
    await openWithoutManuscript(page, 'Schedule');
  },
};
