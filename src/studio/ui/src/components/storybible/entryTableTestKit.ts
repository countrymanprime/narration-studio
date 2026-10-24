// What the Story Bible page tests read from the entry table: its rows (an entry's row carries `data-entry-id`) and the text of a row's cells.
import { fireEvent, screen, within } from '@testing-library/react';

export const entryTable = () => screen.getByRole('table', { name: 'Story Bible entries' });
export const entryRows = () =>
  within(entryTable())
    .queryAllByRole('row')
    .filter((row) => row.hasAttribute('data-entry-id'));
export const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell');
export const rowName = (row: HTMLElement) => (row.querySelector('[data-entry-name]') ?? cellsOf(row)[0]!).textContent;
export const rowNames = () => entryRows().map(rowName);

/** Chooses a kind in the Kind menu over the table ('All' for every kind). */
export const chooseKind = (kind: string) => fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: kind } });
/** Chooses what the Show menu keeps: 'all', 'review' or 'verify'. */
export const chooseShow = (show: 'all' | 'review' | 'verify') => fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), { target: { value: show } });
