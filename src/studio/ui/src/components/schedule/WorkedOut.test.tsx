// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkedOut } from './WorkedOut';
import type { Calc } from './progress';

// #3443: the worked-out list draws hours as "4h 35m" and spells each out for a screen reader ("4 hours 35 minutes").
describe('WorkedOut', () => {
  it('draws each hours figure marked and reads it spelled out', () => {
    const k = {
      recLeft: 4 + 35 / 60,
      editLeft: 4 + 17 / 60,
      proofLeft: 2 + 21 / 60,
      pickH: 11 / 60,
      remain: 11 + 24 / 60,
      days: 3,
      finish: new Date(2026, 9, 5),
      daysLeft: null,
    } as unknown as Calc;
    render(<WorkedOut k={k} />);
    const term = screen.getByText('Recording left', { selector: 'dt' });
    const value = term.parentElement!.querySelector('dd')!;
    expect(value.querySelector('[aria-hidden="true"]')!.textContent).toBe('4h 35m');
    expect(value.querySelector('.sr-only')!.textContent).toBe('4 hours 35 minutes');
    const left = screen.getByText('Work left', { selector: 'dt' }).parentElement!.querySelector('dd')!;
    expect(left.querySelector('.sr-only')!.textContent).toBe('11 hours 24 minutes');
  });

  // #3443: an hours figure under a minute reads "<0h 01m" and is spoken "less than a minute".
  it('draws under a minute as <0h 01m, spoken as less than a minute', () => {
    const k = {
      recLeft: 0.004,
      editLeft: 0.004,
      proofLeft: 0.004,
      pickH: 0.004,
      remain: 0.016,
      days: 1,
      finish: new Date(2026, 9, 5),
      daysLeft: null,
    } as unknown as Calc;
    render(<WorkedOut k={k} />);
    const value = screen.getByText('Pickups', { selector: 'dt' }).parentElement!.querySelector('dd')!;
    expect(value.querySelector('[aria-hidden="true"]')!.textContent).toBe('<0h 01m');
    expect(value.querySelector('.sr-only')!.textContent).toBe('less than a minute');
  });
});
