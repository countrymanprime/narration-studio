// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu, textBoxAt } from './ContextMenu';

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

  it('opens a submenu beside its row, runs one of its items and closes the whole menu', async () => {
    const user = userEvent.setup();
    const pick = vi.fn();
    render(
      <ContextMenu
        items={[
          { key: 'play', label: 'Play selection', onSelect: vi.fn() },
          {
            key: 'mark',
            label: 'Mark as',
            onSelect: vi.fn(),
            submenu: [
              { key: 'tone', label: 'Tone', onSelect: pick },
              { key: 'query', label: 'Query', onSelect: vi.fn() },
            ],
          },
        ]}
      >
        <p>Alice was beginning to get very tired.</p>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    const row = await screen.findByRole('menuitem', { name: 'Mark as' });
    expect(row.getAttribute('aria-haspopup')).toBe('menu');
    expect(screen.queryByRole('menuitem', { name: 'Tone' })).toBeNull();
    await user.click(row);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Tone' }));
    expect(pick).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
  });

  it('opens a submenu with the Right arrow, and leaves a submenu row that is unavailable shut with its reason', async () => {
    const user = userEvent.setup();
    render(
      <ContextMenu
        items={[
          { key: 'mark', label: 'Mark as', onSelect: vi.fn(), submenu: [{ key: 'tone', label: 'Tone', onSelect: vi.fn() }] },
          {
            key: 'fx',
            label: 'Add FX',
            unavailable: 'Select some words first.',
            onSelect: vi.fn(),
            submenu: [{ key: 'warm', label: 'Warm', onSelect: vi.fn() }],
          },
        ]}
      >
        <p>Alice was beginning to get very tired.</p>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(await screen.findByRole('menuitem', { name: 'Tone' })).toBeTruthy();
    const off = screen.getByRole('menuitem', { name: /Add FX/ });
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(off.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Select some words first.')).toBeTruthy();
    await user.click(off);
    expect(screen.queryByRole('menuitem', { name: 'Warm' })).toBeNull();
  });

  it('draws key hints, and a check on the row that is current, which closes the menu when chosen', async () => {
    const pick = vi.fn();
    render(
      <ContextMenu
        items={[
          {
            key: 'go',
            label: 'Go to',
            onSelect: vi.fn(),
            submenu: [
              { key: 'a', label: 'Production', checked: true, onSelect: pick },
              { key: 'b', label: 'Script', checked: false, onSelect: pick },
              { key: 'c', label: 'Booth', checked: false, unavailable: 'Import a manuscript first.', onSelect: pick },
            ],
          },
          { key: 'jump', label: 'Jump menu…', shortcut: ['Ctrl', 'K'], onSelect: vi.fn() },
        ]}
      >
        <p>Empty</p>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Empty'));
    const jump = await screen.findByRole('menuitem', { name: /^Jump menu…/ });
    expect(within(jump).getByText('Ctrl')).toBeTruthy();
    expect(within(jump).getByText('K')).toBeTruthy();
    await userEvent.setup().keyboard('{ArrowDown}{ArrowRight}');
    const rows = await screen.findAllByRole('menuitemcheckbox');
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(rows[2].getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(rows[1]);
    expect(pick).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));
  });
});

// Alignment audit R3SC-2: the menu opened on top of the word that was clicked. Opened on text, it is placed against the text's box at the
// pointer's x, so it starts below the line (or above it), never on it. jsdom has no layout, so the browser's answers are stood in for.
describe('textBoxAt', () => {
  const line = new DOMRect(10, 100, 300, 20);
  const stubCaret = (box: DOMRect | null) => {
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => (box ? { getClientRects: () => [box], getBoundingClientRect: () => box } : null),
    });
  };
  afterEach(() => {
    Reflect.deleteProperty(document, 'caretRangeFromPoint');
    vi.restoreAllMocks();
  });

  it("is the line under the pointer, at the pointer's x", () => {
    stubCaret(line);
    expect(textBoxAt(42, 110)).toEqual(new DOMRect(42, 100, 0, 20));
  });

  it('is the whole selection when the pointer is inside it, over every line it runs on', () => {
    stubCaret(line);
    const range = {
      getClientRects: () => [new DOMRect(40, 100, 200, 20), new DOMRect(10, 120, 120, 20)],
      getBoundingClientRect: () => new DOMRect(10, 100, 230, 40),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false, rangeCount: 1, getRangeAt: () => range } as unknown as Selection);
    expect(textBoxAt(60, 130)).toEqual(new DOMRect(60, 100, 0, 40));
  });

  it('is nothing off text: no caret, or a caret on a line away from the pointer', () => {
    stubCaret(null);
    expect(textBoxAt(42, 110)).toBeUndefined();
    stubCaret(line);
    expect(textBoxAt(42, 400)).toBeUndefined();
  });
});
