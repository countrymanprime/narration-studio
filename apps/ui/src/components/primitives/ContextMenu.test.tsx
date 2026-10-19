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

  describe('a submenu', () => {
    const chosen = vi.fn();
    const withSub = [
      {
        key: 'fx-add',
        label: 'Add FX',
        onSelect: vi.fn(),
        submenu: [
          { key: 'a', label: 'Podcast Voice', onSelect: chosen },
          { key: 'b', label: 'Vocal Warmth', onSelect: vi.fn(), unavailable: 'Spans two paragraphs.' },
        ],
      },
      { key: 'off', label: 'Mark as', onSelect: vi.fn(), unavailable: 'Only said.', submenu: [{ key: 'c', label: 'Tone', onSelect: vi.fn() }] },
    ];
    const open = () => {
      chosen.mockClear();
      render(
        <ContextMenu items={withSub}>
          <p>Alice was beginning to get very tired.</p>
        </ContextMenu>,
      );
      fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    };

    it('opens beside its row on a click, runs a choice and closes the whole menu', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      open();
      const row = await screen.findByRole('menuitem', { name: /Add FX/ });
      expect(row.getAttribute('aria-haspopup')).toBe('menu');
      await user.click(row);
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Podcast Voice' }));
      expect(chosen).toHaveBeenCalledOnce();
      expect(withSub[0].onSelect).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    });

    it('opens with ArrowRight, closes with ArrowLeft and keeps an unavailable choice off', async () => {
      const user = userEvent.setup();
      open();
      await screen.findAllByRole('menuitem');
      await user.keyboard('{ArrowDown}{ArrowRight}');
      const off = await screen.findByRole('menuitem', { name: /Vocal Warmth/ });
      expect(off.getAttribute('aria-disabled')).toBe('true');
      expect(screen.getByText('Spans two paragraphs.')).toBeTruthy();
      await user.keyboard('{ArrowLeft}');
      await waitFor(() => expect(screen.queryByRole('menuitem', { name: /Podcast Voice/ })).toBeNull());
      expect(screen.getByRole('menuitem', { name: /Add FX/ })).toBeTruthy();
    });

    it('draws a row that is unavailable as a plain disabled item with its reason, and opens nothing', async () => {
      const user = userEvent.setup();
      open();
      const row = await screen.findByRole('menuitem', { name: /Mark as/ });
      expect(row.getAttribute('aria-disabled')).toBe('true');
      expect(row.getAttribute('aria-haspopup')).toBeNull();
      await user.click(row);
      expect(screen.queryByRole('menuitem', { name: 'Tone' })).toBeNull();
    });
  });
});
