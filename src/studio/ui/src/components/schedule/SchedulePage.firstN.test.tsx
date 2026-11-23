// @vitest-environment jsdom
// #4100: the "First N" milestone saves the N the narrator typed, or refuses it with a reason; it never changes it quietly.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ChapterStatus } from '../../api/contracts/manuscript';
import { REC, installKit, mountSchedule, stored } from './scheduleKit.test';

installKit();

const book = (n: number, first: ChapterStatus = 'not_started'): ChapterStatus[] => Array.from({ length: n }, (_, i) => (i === 0 ? first : 'not_started'));
const dialog = () => within(screen.getByRole('dialog'));
const RANGE_12 = 'The book has 12 chapters. Write a number from 1 to 12.';
const WHOLE_12 = 'Write a whole number of chapters from 1 to 12.';

/** Opens the Edit dialog of the seeded milestone, picks "First N chapters" (or minutes) and types `text` into its N field. */
async function typeN(text: string | null, field: 'chN' | 'minN' = 'chN') {
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${REC.name}` }));
  const d = dialog();
  await userEvent.selectOptions(d.getByRole('combobox', { name: 'What the milestone measures' }), field);
  const label = field === 'chN' ? 'How many chapters' : 'How many finished minutes';
  if (text !== null) fireEvent.change(d.getByLabelText(label), { target: { value: text } });
  return d;
}
const save = (d: ReturnType<typeof dialog>) => fireEvent.click(d.getByRole('button', { name: 'Save' }));

describe('the First N chapters milestone', () => {
  it.each(['1', '2', '3', '4', '5', '12'])('saves the %s that was typed', async (n) => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN(n);
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0].measure).toBe(`ch${n}`);
  });

  it('saves the default it shows, and reloads with the N it saved', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN(null);
    expect((d.getByLabelText('How many chapters') as HTMLInputElement).value).toBe('6');
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0].measure).toBe('ch6');
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${REC.name}` }));
    expect((dialog().getByLabelText('How many chapters') as HTMLInputElement).value).toBe('6');
  });

  it.each([
    ['0', WHOLE_12],
    ['-3', WHOLE_12],
    ['2.5', WHOLE_12],
    ['', WHOLE_12],
    ['13', RANGE_12],
    ['200', RANGE_12],
  ])('refuses %j with a reason and saves nothing', async (text, reason) => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN(text);
    save(d);
    expect((await d.findByRole('alert')).textContent).toBe(reason);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((await stored()).milestones[0].measure).toBe('rec');
  });

  it('does not rewrite what is typed when the field loses focus', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN('99');
    fireEvent.blur(d.getByLabelText('How many chapters'));
    expect((d.getByLabelText('How many chapters') as HTMLInputElement).value).toBe('99');
  });

  it('reads "First chapter" for 1 and "First 3 chapters" otherwise, in the row', async () => {
    await mountSchedule({
      statuses: book(12),
      seed: {
        milestones: [
          { name: 'One', dueDate: '2026-10-06', measure: 'ch1' },
          { name: 'Three', dueDate: '2026-10-06', measure: 'ch3' },
        ],
      },
    });
    await screen.findByText('One');
    expect(document.querySelector('[data-measure="0"]')?.textContent).toBe('First chapter edited and proofed');
    expect(document.querySelector('[data-measure="1"]')?.textContent).toBe('First 3 chapters edited and proofed');
  });

  it('counts the chapters actually proofed: with Chapter 1 proofed, First 1 is on track and First 2 is not', async () => {
    await mountSchedule({
      statuses: book(12, 'finalized'),
      seed: {
        milestones: [
          { name: 'One', dueDate: '2026-10-02', measure: 'ch1' },
          { name: 'Two', dueDate: '2026-10-02', measure: 'ch2' },
        ],
      },
    });
    await screen.findByText('One');
    const status = (name: string) => screen.getByText(name).closest('tr')!.textContent ?? '';
    expect(status('One')).toMatch(/est\. Oct 1/);
    expect(status('Two')).not.toMatch(/est\. Oct 1/);
  });

  it('a one-chapter book offers 1 and refuses 2', async () => {
    await mountSchedule({ statuses: book(1) });
    const d = await typeN('2');
    save(d);
    expect((await d.findByRole('alert')).textContent).toBe('The book has 1 chapter. Write a number from 1 to 1.');
  });

  it('an empty book has no Schedule to add a milestone to (the draft refuses the N in draft.test.ts)', async () => {
    await mountSchedule({ statuses: [] });
    expect(screen.queryByRole('button', { name: `Edit ${REC.name}` })).toBeNull();
  });

  it('a 200-chapter book accepts 200 and refuses 201', async () => {
    await mountSchedule({ statuses: book(200) });
    const d = await typeN('201');
    save(d);
    expect((await d.findByRole('alert')).textContent).toBe('The book has 200 chapters. Write a number from 1 to 200.');
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: '200' } });
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0].measure).toBe('ch200');
  });
});

describe('the First N finished minutes milestone (the sibling N)', () => {
  it('saves the minutes typed, and refuses 0, a decimal and an empty field with a reason', async () => {
    await mountSchedule({ statuses: book(12) });
    const d = await typeN('20', 'minN');
    save(d);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await stored()).milestones[0].measure).toBe('min20');
    for (const bad of ['0', '1.5', '']) {
      fireEvent.click(await screen.findByRole('button', { name: `Edit ${REC.name}` }));
      const again = dialog();
      fireEvent.change(again.getByLabelText('How many finished minutes'), { target: { value: bad } });
      save(again);
      expect((await again.findByRole('alert')).textContent).toMatch(/^Write a whole number of minutes from 1 to [\d,]+\.$/);
      fireEvent.click(again.getByRole('button', { name: 'Cancel' }));
    }
    expect((await stored()).milestones[0].measure).toBe('min20');
  });

  it('reads "First finished minute" for 1', async () => {
    await mountSchedule({ statuses: book(12), seed: { milestones: [{ name: 'One', dueDate: '2026-10-06', measure: 'min1' }] } });
    await screen.findByText('One');
    expect(document.querySelector('[data-measure="0"]')?.textContent).toBe('First finished minute');
  });
});
