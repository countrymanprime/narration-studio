// @vitest-environment jsdom
// Counts: none, one, a hundred (the host's limit) and thousands (a plan edited by hand) of milestones, and thousands of chapters.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProductionMilestone } from '../../api/contracts/production';
import { installKit, mountSchedule, stored } from './scheduleKit.test';

installKit();

const many = (n: number): ProductionMilestone[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Milestone ${i}`,
    dueDate: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  }));

describe('how many', () => {
  it('draws only the Final delivery row with no milestones', async () => {
    await mountSchedule({ seed: { milestones: [] } });
    await screen.findByText('Final delivery');
    expect(document.querySelectorAll('[data-name]')).toHaveLength(0);
  });

  it('keeps the Milestone column readable beside a 200-character name', async () => {
    await mountSchedule({ seed: { milestones: [{ name: 'x'.repeat(200), dueDate: '2026-10-25' }] } });
    await screen.findByText('Final delivery');
    expect(screen.getByRole('columnheader', { name: 'Milestone' }).className).toContain('min-w-[10rem]');
  });

  it('scrolls the table inside its own card, with a keyboard stop and the edge cue', async () => {
    await mountSchedule({ seed: { milestones: [{ name: 'Draft', dueDate: '2026-10-25' }] } });
    const area = await screen.findByRole('group', { name: 'Milestones scroll area' });
    expect(area.className).toContain('scroll-x-edges');
    expect(area.getAttribute('tabindex')).toBe('0');
    expect(within(area).getByRole('table', { name: 'Milestones' })).toBeTruthy();
  });

  it('draws five hundred milestones read from a hand-edited plan, in a few seconds (the host saves at most a hundred; a plan edited by hand can hold more)', async () => {
    const started = Date.now();
    await mountSchedule({ seed: { milestones: many(500) } });
    await screen.findByText('Final delivery');
    expect(document.querySelectorAll('[data-name]')).toHaveLength(500);
    expect(Date.now() - started).toBeLessThan(8000);
  });

  it("refuses the hundred-and-first milestone with the host's sentence in the dialog and keeps the list", async () => {
    await mountSchedule({ seed: { milestones: many(100) } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add milestone' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'One too many' } });
    fireEvent.change(within(dialog).getByLabelText('Due'), { target: { value: '2026-10-25' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add milestone' }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/at most 100 milestones/));
    expect((await stored()).milestones).toHaveLength(100);
  });

  it('adds up five thousand chapters without freezing', async () => {
    const started = Date.now();
    await mountSchedule({ statuses: Array.from({ length: 5000 }, () => 'not_started' as const) });
    await screen.findByText('Work left');
    expect(Date.now() - started).toBeLessThan(8000);
    expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
  });
});
