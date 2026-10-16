// How to reach each `schedule` state in STATE_CATALOG (see app.drivers.ts).
import { settlePage } from '../helpers/settle';
import { type Driver, clickNav, clickVisible, confirmDialog, openWithoutManuscript } from './shared';

// The mock's own day (the seeds' due dates are dated against it), so a state reads the same on every run. The clock keeps ticking.
const MOCK_DAY = new Date(2026, 8, 26, 9, 0, 0);

// Opens the Schedule through the rail, optionally booted with a mock seed (main.tsx), and waits until the plan has been read.
async function openSchedule(page: Parameters<Driver>[0], query = '', day: Date = MOCK_DAY): Promise<void> {
  await page.clock.install({ time: day });
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
  overdue: async (page) => {
    // The seed moves to the day the app opens on, so it is opened on the mock's day and the clock then moves past its due date
    // (the page re-reads on its minute timer and moves "today" with it).
    await openSchedule(page, '?mockProduction=on-pace');
    await page.clock.setSystemTime(new Date(2026, 9, 20, 9, 0, 0));
    await page.clock.runFor(61_000);
    await page
      .getByText(/days overdue/)
      .first()
      .waitFor();
  },
  'long-text': async (page) => {
    await openSchedule(page, '?mockProduction=on-pace');
    const add = async (name: string, note: string) => {
      await clickVisible(page, 'button', 'Add milestone');
      const dialog = confirmDialog(page, /milestone/i);
      await dialog.waitFor();
      await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
      await dialog.getByRole('textbox', { name: 'Due' }).fill('2026-10-02');
      await dialog.getByRole('textbox', { name: 'Note' }).fill(note);
      await dialog.getByRole('button', { name: 'Add milestone' }).click();
      await dialog.waitFor({ state: 'detached' });
    };
    await add('W'.repeat(200), 'a note');
    await add('تسليم الفصل الأول للمراجعة النهائية', 'ملاحظة');
    await add('🎙️ Final mix 🦎🍺 — 👨‍👩‍👧‍👦', '🍺');
    await page.getByText('تسليم الفصل الأول للمراجعة النهائية').waitFor();
  },
  'no-manuscript': async (page) => {
    await openWithoutManuscript(page, 'Schedule');
  },
};
