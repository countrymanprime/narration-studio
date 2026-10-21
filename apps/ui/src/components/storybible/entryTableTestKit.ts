// What the Story Bible page tests read from the entry table: its rows (an entry's row carries `data-entry-id`) and the text of a row's cells.
import { screen, within } from '@testing-library/react';

export const entryTable = () => screen.getByRole('table', { name: 'Story Bible entries' });
export const entryRows = () =>
  within(entryTable())
    .queryAllByRole('row')
    .filter((row) => row.hasAttribute('data-entry-id'));
export const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell');
export const rowName = (row: HTMLElement) => cellsOf(row)[0]!.textContent;
export const rowNames = () => entryRows().map(rowName);
