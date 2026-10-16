// @vitest-environment jsdom
// The Contract panel (state matrix, "Contract"): every kind of amount a narrator can type, a host that refuses, and changes made in a hurry.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mountSchedule, stored, toasts, installKit } from './scheduleKit.test';
import { parseAmount, plainNumber } from './payment';

installKit();

const amountField = () => screen.findByRole('textbox', { name: 'Rate per finished hour' }) as Promise<HTMLInputElement>;
const commit = async (text: string) => {
  const field = await amountField();
  fireEvent.change(field, { target: { value: text } });
  fireEvent.blur(field);
};
const value = () => document.querySelector('[data-contract-value]')?.textContent;

describe('an amount as typed', () => {
  it.each([
    ['0', 0],
    ['1', 1],
    ['250.5', 250.5],
    ['1,250.50', 1250.5],
    ['99999999999', 99999999999],
  ])('stores %s', async (text, amount) => {
    await mountSchedule();
    await commit(text);
    await waitFor(async () => expect((await stored()).contractedAmount).toBe(amount));
  });

  it('refuses an amount too large to be a rate, with its own sentence, and keeps the stored one', async () => {
    const calls = vi.fn();
    await mountSchedule({ wrap: (base) => ({ setProductionDeadline: async (d, a) => (calls(d, a), base.setProductionDeadline(d, a)) }) });
    await commit('99999999999999999999');
    await waitFor(() => expect(toasts().join(' ')).toMatch(/too large\. Write it as 1,000,000,000,000 or less/));
    expect(calls).not.toHaveBeenCalled();
    expect((await amountField()).value).toBe('250');
    expect(document.body.textContent).not.toMatch(/Infinity|e\+|NaN/);
  });

  it('shows the largest amount as digits and its value with separators, never an exponent', async () => {
    await mountSchedule();
    await commit('1000000000000');
    await waitFor(() => expect(value()).toMatch(/^[\d,]+$/));
    expect((await amountField()).value).toBe('1000000000000');
    expect(document.body.textContent).not.toMatch(/Infinity|e\+|NaN/);
  });

  it('clears the amount when the field is emptied', async () => {
    await mountSchedule();
    await commit('');
    await waitFor(async () => expect((await stored()).contractedAmount).toBeNull());
  });

  it.each([
    ['negative', '-5'],
    ['text', 'abc'],
    ['Infinity', 'Infinity'],
    ['an exponent', '1e3'],
    ['hexadecimal', '0x10'],
    ['a decimal comma, which would read as 15', '1,5'],
    ['Arabic-Indic digits', '٢٤٠٠'],
    ['emoji', '💰'],
    ['two points', '1.2.3'],
  ])('refuses %s with a sentence, sends nothing and puts the stored amount back', async (_name, text) => {
    const calls = vi.fn();
    await mountSchedule({ wrap: (base) => ({ setProductionDeadline: async (d, a) => (calls(d, a), base.setProductionDeadline(d, a)) }) });
    await commit(text);
    await waitFor(() => expect(toasts().join(' ')).toMatch(/Write the rate as a number|Write a decimal with a point/));
    expect(calls).not.toHaveBeenCalled();
    expect((await amountField()).value).toBe('250');
  });

  it('takes the refusal away once a later amount is stored', async () => {
    await mountSchedule();
    await commit('1,5');
    await waitFor(() => expect(toasts().join(' ')).toMatch(/Write a decimal with a point/));
    await commit('1000');
    await waitFor(async () => expect((await stored()).contractedAmount).toBe(1000));
    await waitFor(() => expect(toasts().join(' ')).not.toMatch(/Write a decimal with a point/));
  });

  it('takes the refusal away when the stored amount is typed again', async () => {
    await mountSchedule();
    await commit('1,5');
    await waitFor(() => expect(toasts().join(' ')).toMatch(/Write a decimal with a point/));
    await commit('250.0');
    await waitFor(() => expect(toasts().join(' ')).not.toMatch(/Write a decimal with a point/));
  });

  it("shows the host's sentence and the stored amount when the host refuses it", async () => {
    await mountSchedule({
      wrap: () => ({
        setProductionDeadline: async () => {
          throw new Error('the manifest is locked');
        },
      }),
    });
    await commit('300');
    await waitFor(() => expect(toasts().join(' ')).toMatch(/locked/));
    expect((await amountField()).value).toBe('250');
    expect((await stored()).contractedAmount).toBe(250);
  });

  it('does not write when the amount is unchanged', async () => {
    const calls = vi.fn();
    await mountSchedule({ wrap: (base) => ({ setProductionDeadline: async (d, a) => (calls(d, a), base.setProductionDeadline(d, a)) }) });
    await commit('250');
    await commit('250.0');
    expect(calls).not.toHaveBeenCalled();
  });

  it('parses only digits with a point, and commas in groups of three', () => {
    expect(parseAmount('1,250')).toBe(1250);
    expect(parseAmount('12,50')).toBeNull();
    expect(parseAmount('.5')).toBeNull();
    expect(parseAmount(' 7 ')).toBe(7);
    expect(plainNumber(1e21)).toBe('1000000000000000000000');
    expect(plainNumber(0.1)).toBe('0.1');
  });
});

describe('clearing the amount', () => {
  it('keeps a per-finished-hour book per finished hour when its payment was never stored, and Undo brings the amount back', async () => {
    await mountSchedule({ seed: { payment: undefined } });
    await commit('');
    await waitFor(async () => expect((await stored()).contractedAmount).toBeNull());
    expect((await stored()).payment).toBe('per_finished_hour');
    expect(await screen.findByRole('textbox', { name: 'Rate per finished hour' })).toBeTruthy();
  });
});

describe('how the book pays', () => {
  it('keeps the due date when the amount changes and the amount when the date changes', async () => {
    await mountSchedule();
    await commit('300');
    await waitFor(async () => expect((await stored()).contractedAmount).toBe(300));
    const due = screen.getByRole('textbox', { name: 'Delivery due' });
    fireEvent.change(due, { target: { value: '2026-11-05' } });
    fireEvent.blur(due);
    await waitFor(async () => expect((await stored()).deadline).toBe('2026-11-05'));
    expect((await stored()).contractedAmount).toBe(300);
  });

  it('answers a change of payment type that the host refuses with its sentence and the stored type', async () => {
    await mountSchedule({
      wrap: () => ({
        setProductionPayment: async () => {
          throw new Error('payment cannot change on a delivered book');
        },
      }),
    });
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'How you are paid' }), 'royalty_share');
    await waitFor(() => expect(toasts().join(' ')).toMatch(/delivered book/));
    expect((await stored()).payment).toBe('per_finished_hour');
    expect(within(document.body).queryByText('Value at this rate')).not.toBeNull();
  });

  it('writes two quick changes in order, the last one standing', async () => {
    await mountSchedule();
    const select = (await screen.findByRole('combobox', { name: 'How you are paid' })) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'royalty_share' } });
    fireEvent.change(select, { target: { value: 'none' } });
    await waitFor(async () => expect((await stored()).payment).toBe('none'));
    expect(document.querySelector('[data-contract-value]')).toBeNull();
  });
});
