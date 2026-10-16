// @vitest-environment jsdom
// Long, right-to-left and emoji text in the milestones (state matrix, "Milestones"): shown as written, read in the right direction, and saved whole.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { installKit, mountSchedule, stored } from './scheduleKit.test';

installKit();

const LONG = 'W'.repeat(200);
const RTL = 'تسليم الفصل الأول';
const EMOJI = '🎙️ Final mix 🦎🍺 — 👨‍👩‍👧‍👦';

describe('names and notes as written', () => {
  it('shows a 200-character name with no spaces in the row, breakable so the table does not widen, and an RTL name that reads right to left', async () => {
    await mountSchedule({
      seed: {
        milestones: [
          { name: LONG, dueDate: '2026-10-05' },
          { name: RTL, dueDate: '2026-10-06', note: RTL },
          { name: EMOJI, dueDate: '2026-10-07', note: EMOJI },
        ],
      },
    });
    const long = await screen.findByText(LONG);
    expect(long.className).toMatch(/overflow-wrap:anywhere/);
    expect(screen.getByText(RTL, { selector: 'b' }).getAttribute('dir')).toBe('auto');
    expect(screen.getByText(EMOJI, { selector: 'b' })).toBeTruthy();
  });

  it('saves a name and a note in right-to-left and emoji text whole', async () => {
    await mountSchedule();
    fireEvent.click(await screen.findByRole('button', { name: 'Add milestone' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: RTL } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Due' }), { target: { value: '2026-10-25' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Note' }), { target: { value: EMOJI } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add milestone' }));
    await waitFor(async () => expect((await stored()).milestones.at(-1)).toMatchObject({ name: RTL, note: EMOJI }));
  });

  it("refuses a name of only spaces and one over the limit with the host's sentence", async () => {
    await mountSchedule();
    fireEvent.click(await screen.findByRole('button', { name: 'Add milestone' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: '   ' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Due' }), { target: { value: '2026-10-25' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add milestone' }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/name/i));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'N'.repeat(201) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add milestone' }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/200/));
  });
});
