// @vitest-environment jsdom
// SN-B94 (G12): the arrow keys move through the entry list, as catalogue commands of the page scope and not a listener of the page's own.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { COMMAND_CATALOG } from '../../input/commands.catalog';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { Guide } from './Guide';

afterEach(cleanup);

async function renderGuide() {
  window.localStorage.clear();
  render(
    <MemoryRouter>
      <ApiProvider api={createMockApi()}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findAllByText('Alice');
  await screen.findByRole('button', { name: 'Place' });
  const out = within(screen.getByRole('list', { name: 'Story Bible entries' })).getAllByRole('button');
  return out;
}

describe('arrow-keys-move-through-the-list', () => {
  it('arrow keys move through the list', async () => {
    const rows = await renderGuide();
    rows[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[1]).toBe(document.activeElement);
    expect(rows[1]!.tabIndex).toBe(0);
    expect(rows[0]!.tabIndex).toBe(-1);
    await userEvent.keyboard('{ArrowUp}');
    expect(rows[0]).toBe(document.activeElement);
    // The ends stop the walk.
    await userEvent.keyboard('{ArrowUp}');
    expect(rows[0]).toBe(document.activeElement);
    rows.at(-1)!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(rows.at(-1)).toBe(document.activeElement);
  });

  it('steps from the open entry when focus is outside the list, by the catalogue rows', async () => {
    const rows = await renderGuide();
    document.body.focus();
    await userEvent.keyboard('{ArrowDown}');
    // Alice is open; the key steps to the entry after it.
    expect(rows[1]).toBe(document.activeElement);
  });

  it('leaves the arrow keys to the search box', async () => {
    const rows = await renderGuide();
    const box = screen.getByRole('textbox', { name: 'Search entries' });
    box.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(box).toBe(document.activeElement);
    expect(rows.every((row) => row !== document.activeElement)).toBe(true);
  });

  it('keeps one tab stop in the list, on the selected entry', async () => {
    const rows = await renderGuide();
    expect(rows.filter((row) => row.tabIndex === 0)).toHaveLength(1);
    expect(rows.find((row) => row.tabIndex === 0)!.getAttribute('aria-current')).toBe('true');
  });

  it('is two rows of the key catalogue on the page scope, listed on the sheet and in Settings', () => {
    for (const id of ['storybible.entry.next', 'storybible.entry.prev']) {
      const row = COMMAND_CATALOG.find((command) => command.id === id)!;
      expect(row.scope).toBe('page');
      expect(row.surfaces).toEqual(['help', 'settings']);
    }
  });
});
