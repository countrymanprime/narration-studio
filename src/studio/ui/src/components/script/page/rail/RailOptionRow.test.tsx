// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RailFieldRow, RailOptionRow } from './RailOptionRow';

afterEach(cleanup);

describe('the rail option rows', () => {
  it('put a label and its control on one grid, with the hint under the label', () => {
    render(
      <RailOptionRow label="Definitions from" hint="Opens the web page">
        <button type="button">Source</button>
      </RailOptionRow>,
    );
    const row = document.querySelector('[data-rail-row]')!;
    expect(row.className).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(row.textContent).toContain('Definitions from');
    expect(screen.getByText('Opens the web page').className).toContain('col-span-2');
    expect(screen.getByRole('button', { name: 'Source' })).toBeTruthy();
  });

  it('give a field row the same grid as an option row', () => {
    render(
      <>
        <RailOptionRow label="Say it">
          <button type="button">A</button>
        </RailOptionRow>
        <RailFieldRow field={<input aria-label="Say it" />} action={<button type="button">Save</button>} />
      </>,
    );
    const rows = Array.from(document.querySelectorAll('[data-rail-row]'));
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toBe(rows[1].className);
  });
});
