// What the Story Bible page tests read from the entry table: its rows (an entry's row carries `data-entry-id`) and the text of a row's cells.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

export const entryTable = () => screen.getByRole('table', { name: 'Story Bible entries' });
export const entryRows = () =>
  within(entryTable())
    .queryAllByRole('row')
    .filter((row) => row.hasAttribute('data-entry-id'));
export const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell');
export const rowName = (row: HTMLElement) => (row.querySelector('[data-entry-name]') ?? cellsOf(row)[0]!).textContent;
export const rowNames = () => entryRows().map(rowName);

const SHOW_LABEL = { all: 'All entries', review: 'Needs review', verify: 'Needs verification' } as const;

/** Opens the Filter menu over the table, runs `pick` inside it, and closes it again. */
async function inFilterMenu(pick: () => Promise<void>) {
  await userEvent.click(screen.getByRole('button', { name: /^Filter/ }));
  await screen.findByRole('menu');
  await pick();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

/** Keeps one kind in the Filter menu ('All' for every kind): every other kind is unticked. */
export const chooseKind = (kind: string) =>
  inFilterMenu(async () => {
    for (const box of screen.queryAllByRole('menuitemcheckbox')) {
      const want = box.textContent?.startsWith(kind) === true && kind !== 'All';
      if ((box.getAttribute('aria-checked') === 'true') !== want) await userEvent.click(box);
    }
  });
/** Chooses what the Filter menu's Show keeps: 'all', 'review' or 'verify'. */
export const chooseShow = (show: 'all' | 'review' | 'verify') =>
  inFilterMenu(async () => {
    await userEvent.click(screen.getByRole('menuitemradio', { name: new RegExp(`^${SHOW_LABEL[show]}`) }));
  });

/** Opens the Filter menu, reads it with `read`, and closes it again. */
async function readFilterMenu<T>(read: () => T): Promise<T> {
  let result!: T;
  await inFilterMenu(async () => {
    result = read();
  });
  return result;
}

/** The Filter menu's Show choice named `label` (read by opening the menu): its count and whether it is on, or null when it is not offered. */
export const showChoice = (label: string) =>
  readFilterMenu(() => {
    const radio = screen.queryAllByRole('menuitemradio').find((item) => new RegExp(`^${label}, \\d+$`).test(item.textContent ?? ''));
    if (!radio) return null;
    return { count: Number(radio.textContent!.split(', ').pop()), on: radio.getAttribute('aria-checked') === 'true' };
  });
/** Waits until the Filter menu offers the Show choice `label` with this count. */
export const waitForShowChoice = (label: string, count: number) => waitFor(async () => expect((await showChoice(label))?.count).toBe(count));
/** The kinds the Filter menu offers, by name. */
export const kindChoices = () => readFilterMenu(() => screen.queryAllByRole('menuitemcheckbox').map((box) => box.textContent!.split(', ')[0]));
