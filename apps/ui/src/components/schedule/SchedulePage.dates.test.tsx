// @vitest-environment jsdom
// The Schedule page's dates (state matrix: docs/research/schedule-page-state-matrix.md, "Due date and the verdict"): none, past, today, far
// away, impossible, mistyped, cleared, refused by the host, committed twice, and a plan edited by hand to hold something that is not a date.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { REC, mountSchedule, stored, toasts, installKit } from './scheduleKit.test';

installKit();

const dueField = () => screen.findByRole('textbox', { name: 'Delivery due' }) as Promise<HTMLInputElement>;
const commit = async (text: string) => {
  const field = await dueField();
  fireEvent.change(field, { target: { value: text } });
  fireEvent.blur(field);
};
const subtitle = () => document.querySelector('h1')?.parentElement?.textContent ?? '';

describe('what the header and the verdict say about the days', () => {
  it.each([
    ['2026-10-09', /Due Oct 9 · 8 days left/],
    ['2026-10-02', /Due Oct 2 · 1 day left/],
    ['2026-10-01', /Due Oct 1 · today/],
    ['2026-09-30', /Due Sep 30 · 1 day overdue/],
    ['2026-09-29', /Due Sep 29 · 2 days overdue/],
    ['2025-10-01', /Due Oct 1, 2025 · 365 days overdue/],
  ])('says %s plainly, never "-2 days left"', async (deadline, said) => {
    await mountSchedule({ seed: { deadline }, statuses: ['not_started'] });
    await dueField();
    expect(subtitle()).toMatch(said);
    expect(subtitle()).not.toMatch(/-\d/);
  });

  it('shows the year of a date that is not this year, so 2031 is not read as 2026', async () => {
    await mountSchedule({
      seed: {
        deadline: '2031-10-16',
        milestones: [
          { name: 'Far', dueDate: '2020-01-01' },
          { name: 'Near', dueDate: '2026-11-01' },
        ],
      },
    });
    await dueField();
    expect(subtitle()).toMatch(/Due Oct 16, 2031/);
    expect(screen.getByText('Far').closest('tr')?.textContent).toContain('Jan 1, 2020');
    expect(screen.getByText('Near').closest('tr')?.textContent).toMatch(/Nov 1(?!,)/);
  });

  it('draws a chart without a plan line when the due date is before the plan starts', async () => {
    await mountSchedule({ seed: { deadline: '2026-09-20' } });
    await dueField();
    expect(document.querySelector('[data-line="plan"]')).toBeNull();
    expect(document.querySelector('[data-line="due"]')).not.toBeNull();
  });

  it('never says Infinity: a date that is today or past is answered with how late, not a pace', async () => {
    for (const deadline of ['2026-10-01', '2026-09-20']) {
      await mountSchedule({ seed: { deadline }, statuses: ['not_started'] });
      await dueField();
      expect(document.body.textContent).not.toMatch(/Infinity|NaN|Invalid/);
      expect(document.body.textContent).toMatch(/Behind/);
      cleanup();
    }
  });

  it('reads a far future and a far past date without overflow or exponent text', async () => {
    await mountSchedule({ seed: { deadline: '9999-12-31' } });
    await dueField();
    expect(subtitle()).toMatch(/Due Dec 31, 9999 · 2,9\d\d,\d{3} days left/);
    expect(document.body.textContent).not.toMatch(/Infinity|NaN|e\+/);
  });

  it('reads a due date in the year 150 as not a real date, without a freeze or Invalid Date', async () => {
    await mountSchedule({ seed: { deadline: '0150-01-01' } });
    await dueField();
    expect(subtitle()).toMatch(/0150-01-01, is not a real date/);
    expect(document.body.textContent).not.toMatch(/Infinity|NaN|Invalid/);
  });

  it('draws a date that is not a real date as written, and the page does not break', async () => {
    await mountSchedule({ seed: { deadline: '2026-10-31', milestones: [{ ...REC, dueDate: '2026-13-45' }] } });
    await dueField();
    expect(document.body.textContent).toContain('2026-13-45');
    expect(document.body.textContent).not.toMatch(/Invalid Date|NaN/);
    expect(screen.getByRole('img', { name: /not a real date/ })).toBeTruthy();
  });

  it('says so when the plan holds a due date that is not one', async () => {
    await mountSchedule({ seed: { deadline: '2026-02-30' } });
    await dueField();
    expect(subtitle()).toMatch(/2026-02-30, is not a real date/);
    expect(document.body.textContent).not.toMatch(/Invalid Date|NaN/);
  });
});

describe('typing the due date', () => {
  it('sends a real date once and the header follows', async () => {
    const calls = vi.fn();
    await mountSchedule({ wrap: (base) => ({ setProductionDeadline: async (d, a) => (calls(d, a), base.setProductionDeadline(d, a)) }) });
    await commit('2026-11-05');
    await waitFor(() => expect(subtitle()).toMatch(/Due Nov 5/));
    expect(calls).toHaveBeenCalledTimes(1);
    expect(calls).toHaveBeenCalledWith('2026-11-05', 250);
  });

  it.each([
    ['an impossible day', '2026-02-30', /2026-02-30 is not a real date/],
    ['month 13', '2026-13-01', /not a real date/],
    ['the wrong order', '10/14/2026', /YYYY-MM-DD/],
    ['words', 'tomorrow', /YYYY-MM-DD/],
    ['emoji', '📅', /YYYY-MM-DD/],
    ['right-to-left text', 'غدا', /YYYY-MM-DD/],
    ['a minus sign', '-001-01-01', /YYYY-MM-DD/],
    ['year zero', '0000-01-01', /not a real date/],
    ['the year 150', '0150-01-01', /not a real date/],
  ])('refuses %s with a sentence and sends nothing', async (_name, text, sentence) => {
    const calls = vi.fn();
    await mountSchedule({ wrap: (base) => ({ setProductionDeadline: async (d, a) => (calls(d, a), base.setProductionDeadline(d, a)) }) });
    await commit(text);
    await waitFor(() => expect(toasts().join(' ')).toMatch(sentence));
    expect(calls).not.toHaveBeenCalled();
    expect((await dueField()).value).toBe('2026-10-31');
  });

  it('accepts a leap day and a day across a daylight-saving change as whole calendar days', async () => {
    await mountSchedule({ seed: { deadline: '2026-10-31' } });
    await commit('2028-02-29');
    await waitFor(() => expect(subtitle()).toMatch(/Due Feb 29/));
    expect((await stored()).deadline).toBe('2028-02-29');
  });

  it('clears the due date when the field is emptied, with the header and verdict following, and the host holds none', async () => {
    await mountSchedule();
    await commit('');
    await waitFor(() => expect(subtitle()).toMatch(/No due date set/));
    expect((await stored()).deadline).toBeNull();
  });

  it("shows the host's sentence and puts the stored date back when the host refuses", async () => {
    await mountSchedule({
      wrap: () => ({
        setProductionDeadline: async () => {
          throw new Error('the project is read-only');
        },
      }),
    });
    await commit('2026-11-05');
    await waitFor(() => expect(toasts().join(' ')).toMatch(/read-only/));
    expect((await dueField()).value).toBe('2026-10-31');
  });

  it('writes once when Enter and then leaving the field both commit', async () => {
    const calls = vi.fn();
    await mountSchedule({ wrap: (base) => ({ setProductionDeadline: async (d, a) => (calls(d, a), base.setProductionDeadline(d, a)) }) });
    const field = await dueField();
    fireEvent.change(field, { target: { value: '2026-11-05' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);
    fireEvent.blur(field);
    await waitFor(() => expect(subtitle()).toMatch(/Due Nov 5/));
    expect(calls).toHaveBeenCalledTimes(1);
  });
});
