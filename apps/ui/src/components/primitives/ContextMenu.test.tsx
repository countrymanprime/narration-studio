// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';

afterEach(cleanup);

const select = vi.fn();
const items = [
  { key: 'plugin', label: 'Add an effect to this passage…', onSelect: select },
  { key: 'chain', label: 'Put an FX chain on the track…', onSelect: vi.fn(), unavailable: 'REAPER is not connected.' },
];

function renderArea(onOpen = vi.fn()) {
  select.mockClear();
  render(
    <ContextMenu items={items} onOpen={onOpen}>
      <p>Alice was beginning to get very tired.</p>
    </ContextMenu>,
  );
  return { onOpen, area: screen.getByText(/Alice was beginning/) };
}

describe('ContextMenu', () => {
  it('opens a menu of items on a right click, after telling the caller what was pressed', async () => {
    const { onOpen, area } = renderArea();
    fireEvent.contextMenu(area);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(await screen.findAllByRole('menuitem')).toHaveLength(2);
  });

  it('runs an item and closes', async () => {
    const user = userEvent.setup();
    const { area } = renderArea();
    fireEvent.contextMenu(area);
    await user.click(await screen.findByRole('menuitem', { name: /Add an effect/ }));
    expect(select).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
  });

  it('says why an item cannot run, and does not run it', async () => {
    const user = userEvent.setup();
    const { area } = renderArea();
    fireEvent.contextMenu(area);
    const chain = await screen.findByRole('menuitem', { name: /Put an FX chain/ });
    expect(chain.getAttribute('aria-disabled')).toBe('true');
    expect(chain.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('REAPER is not connected.')).toBeTruthy();
    await user.click(chain);
    expect(items[1].onSelect).not.toHaveBeenCalled();
  });

  it('moves with the arrow keys, chooses with Enter and closes on Escape', async () => {
    const user = userEvent.setup();
    const { area } = renderArea();
    fireEvent.contextMenu(area);
    await screen.findAllByRole('menuitem');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(select).toHaveBeenCalledOnce();
    fireEvent.contextMenu(area);
    await screen.findAllByRole('menuitem');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
  });

  it('puts neighbouring items of one group under a heading that names the group', async () => {
    const grouped = [
      { key: 'tone', label: 'Tone', group: 'Mark as', onSelect: vi.fn() },
      { key: 'query', label: 'Query', group: 'Mark as', onSelect: vi.fn() },
      { key: 'place', label: 'Place', group: 'Add to the Story Bible as', onSelect: vi.fn() },
      { key: 'copy', label: 'Copy', onSelect: vi.fn() },
    ];
    render(
      <ContextMenu items={grouped}>
        <p>Alice was beginning to get very tired.</p>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    const groups = await screen.findAllByRole('group');
    expect(
      groups.map((group) => group.getAttribute('aria-labelledby') && document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent),
    ).toEqual(['Mark as', 'Add to the Story Bible as']);
    expect(
      within(groups[0])
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Tone', 'Query']);
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
  });
});
