// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu, textBoxAt } from './ContextMenu';
import { TooltipProvider } from './Tooltip';

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

  it('draws an item with an icon as an icon-only menu item named by its label, with a tooltip, beside its neighbours with icons', async () => {
    const user = userEvent.setup();
    const play = vi.fn();
    render(
      <TooltipProvider>
        <ContextMenu
          items={[
            { key: 'play', label: 'Play selection', icon: 'play', onSelect: play },
            { key: 'copy', label: 'Copy words', icon: 'copy', onSelect: vi.fn() },
            { key: 'off', label: 'Delete words and audio', icon: 'delete', unavailable: 'REAPER is not connected.', onSelect: vi.fn() },
            { key: 'text', label: 'Mark as…', onSelect: vi.fn() },
          ]}
        >
          <p>Alice was beginning to get very tired.</p>
        </ContextMenu>
      </TooltipProvider>,
    );
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    const playItem = await screen.findByRole('menuitem', { name: 'Play selection' });
    expect(playItem.textContent).toBe('');
    expect(playItem.querySelector('svg')).toBeTruthy();
    // The three icons share one row; the row without an icon keeps its text.
    expect(playItem.parentElement!.closest('[data-icon-row]')).toBe(screen.getByRole('menuitem', { name: 'Copy words' }).closest('[data-icon-row]'));
    expect(screen.getByRole('menuitem', { name: 'Mark as…' }).textContent).toBe('Mark as…');
    // A reason is not drawn under the icon: it is the hint and the description, and the item stays off.
    const off = screen.getByRole('menuitem', { name: 'Delete words and audio' });
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(off.getAttribute('aria-description')).toBe('REAPER is not connected.');
    expect(screen.queryByText('REAPER is not connected.')).toBeNull();
    await user.click(playItem);
    expect(play).toHaveBeenCalledOnce();
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
    // Each key waits for the state it acts on (#3075): under load the menu takes focus, and then highlights a row, a little
    // after its items render, and a key that lands before that is lost (the run that failed showed the menu open, nothing
    // highlighted and the submenu closed).
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('menu').contains(document.activeElement)).toBe(true));
    await user.keyboard('{ArrowDown}');
    const goTo = screen.getByRole('menuitem', { name: /^Go to/ });
    await waitFor(() => expect(goTo.hasAttribute('data-highlighted')).toBe(true));
    await user.keyboard('{ArrowRight}');
    const rows = await screen.findAllByRole('menuitemcheckbox');
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(rows[2].getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(rows[1]);
    expect(pick).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));
  });
});

// A menu that has been closed stays drawn for its exit (120 ms): the highlighted item still has focus, so the Enter of a footswitch or the Space of a
// chord pressed inside the exit would press it (#4183: with a take running, an Enter at 20 ms pressed "Roll again" and the take kept recording).
describe('ContextMenu items while it leaves', () => {
  const proto = Element.prototype as unknown as { getAnimations?: () => unknown[] };
  const original = proto.getAnimations;
  afterEach(() => {
    proto.getAnimations = original;
  });
  const leavingMenu = () => document.querySelector('[role="menu"][data-ending-style], [role="menu"][data-closed]');
  const keys = [
    ['Space', { key: ' ', code: 'Space' }],
    ['Enter', { key: 'Enter', code: 'Enter' }],
    ['NumpadEnter', { key: 'Enter', code: 'NumpadEnter' }],
  ] as const;
  const rows = [
    { key: 'roll', label: 'Roll again', onSelect: vi.fn() },
    { key: 'mark', label: 'Mark as done', checked: false, onSelect: vi.fn() },
    { key: 'bookmark', label: 'Bookmark here', icon: 'bookmark' as const, onSelect: vi.fn() },
    { key: 'more', label: 'More', submenu: [{ key: 'inner', label: 'Inner', onSelect: vi.fn() }], onSelect: vi.fn() },
  ];

  // The menu is opened on a right click, left with Escape, and its exit is held until `end()`, as the 120 ms exit is while a key arrives.
  async function escapeWhileLeaving() {
    rows.forEach((row) => row.onSelect.mockClear());
    let endExit: () => void = () => {};
    const finished = new Promise<void>((resolve) => (endExit = resolve));
    proto.getAnimations = () => [{ finished }];
    render(
      <TooltipProvider>
        <ContextMenu items={rows}>
          <p>Alice was beginning to get very tired.</p>
        </ContextMenu>
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(leavingMenu()).not.toBeNull();
    const end = async () => {
      endExit();
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    };
    return { end, user };
  }

  it.each(keys)('an item takes no %s press while the menu is leaving', async (_name, key) => {
    const { end } = await escapeWhileLeaving();
    const pressable = [...screen.getAllByRole('menuitem'), ...screen.getAllByRole('menuitemcheckbox')];
    expect(pressable.length).toBeGreaterThanOrEqual(3);
    for (const item of pressable) {
      fireEvent.keyDown(item, key);
      fireEvent.keyUp(item, key);
      fireEvent.click(item);
    }
    await end();
    rows.forEach((row) => expect(row.onSelect).not.toHaveBeenCalled());
  });

  it('a submenu row is off while the menu leaves, and opens no submenu', async () => {
    const { end } = await escapeWhileLeaving();
    const more = screen.getByRole('menuitem', { name: 'More' });
    expect(more.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(more);
    fireEvent.keyDown(more, { key: 'ArrowRight', code: 'ArrowRight' });
    expect(screen.queryByRole('menuitem', { name: 'Inner' })).toBeNull();
    await end();
  });

  it('the rows keep their look while the menu leaves: the muted look follows the item being unavailable, not disabled', async () => {
    const unavailable = [
      { key: 'plain', label: 'Roll again', onSelect: vi.fn() },
      { key: 'off', label: 'Add FX', unavailable: 'Select some words first.', onSelect: vi.fn() },
      { key: 'icon', label: 'Bookmark here', icon: 'bookmark' as const, onSelect: vi.fn() },
      { key: 'iconoff', label: 'Mute', icon: 'bookmark' as const, unavailable: 'Not now.', onSelect: vi.fn() },
      { key: 'mark', label: 'Mark as done', checked: true, onSelect: vi.fn() },
      { key: 'markoff', label: 'Mark as query', checked: false, unavailable: 'Select a word.', onSelect: vi.fn() },
      {
        key: 'sub',
        label: 'Change type',
        unavailable: 'Select some words first.',
        onSelect: vi.fn(),
        submenu: [{ key: 'tone', label: 'Tone', onSelect: vi.fn() }],
      },
    ];
    let endExit: () => void = () => {};
    const finished = new Promise<void>((resolve) => (endExit = resolve));
    proto.getAnimations = () => [{ finished }];
    render(
      <TooltipProvider>
        <ContextMenu items={unavailable}>
          <p>Alice was beginning to get very tired.</p>
        </ContextMenu>
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    const rowsOf = () => [...screen.getAllByRole('menuitem'), ...screen.getAllByRole('menuitemcheckbox')];
    // The class and the attribute that draw the muted colour and the default cursor: what a row looks like.
    const look = () => rowsOf().map((row) => [row.getAttribute('aria-label') ?? row.textContent, row.className, row.hasAttribute('data-off')]);
    const open = look();
    // Exactly the unavailable rows are marked: the plain one, the icon one, the checked one and the submenu row.
    expect(open.filter((row) => row[2]).map((row) => row[0])).toEqual([
      expect.stringContaining('Add FX'),
      'Mute',
      expect.stringContaining('Change type'),
      expect.stringContaining('Mark as query'),
    ]);
    expect(open.every((row) => !String(row[1]).includes('data-[disabled]'))).toBe(true);
    // Focus is on the popup itself: the unavailable icon row's hint wrapper is a tab stop that took it, and it answers Escape as a tooltip.
    menu.focus();
    await user.keyboard('{Escape}');
    expect(leavingMenu()).not.toBeNull();
    expect(look()).toEqual(open);
    endExit();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('a submenu that closes on its own takes no press in its exit', async () => {
    const inner = vi.fn();
    let endExit: () => void = () => {};
    const finished = new Promise<void>((resolve) => (endExit = resolve));
    proto.getAnimations = () => [{ finished }];
    render(
      <ContextMenu
        items={[
          { key: 'more', label: 'More', onSelect: vi.fn(), submenu: [{ key: 'inner', label: 'Inner', onSelect: inner }] },
          { key: 'other', label: 'Other', onSelect: vi.fn() },
        ]}
      >
        <p>Alice was beginning to get very tired.</p>
      </ContextMenu>,
    );
    const user = userEvent.setup();
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    await user.keyboard('{ArrowDown}{ArrowRight}');
    const innerRow = await screen.findByRole('menuitem', { name: 'Inner' });
    await waitFor(() => expect(document.activeElement).toBe(innerRow));
    // Escape inside a submenu closes only the submenu: the menu stays, and so does the highlighted submenu row until its exit ends.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Other' })).toBeTruthy());
    for (const key of [
      { key: ' ', code: 'Space' },
      { key: 'Enter', code: 'Enter' },
      { key: 'Enter', code: 'NumpadEnter' },
    ]) {
      fireEvent.keyDown(innerRow, key);
      fireEvent.keyUp(innerRow, key);
    }
    fireEvent.click(innerRow);
    expect(inner).not.toHaveBeenCalled();
    endExit();
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Inner' })).toBeNull());
    expect(inner).not.toHaveBeenCalled();
  });

  it("a submenu's own trigger is off and opens nothing during its submenu's exit, and works again once it has settled", async () => {
    const inner = vi.fn();
    let endExit: () => void = () => {};
    const finished = new Promise<void>((resolve) => (endExit = resolve));
    proto.getAnimations = () => [{ finished }];
    render(
      <ContextMenu items={[{ key: 'more', label: 'More', onSelect: vi.fn(), submenu: [{ key: 'inner', label: 'Inner', onSelect: inner }] }]}>
        <p>Alice was beginning to get very tired.</p>
      </ContextMenu>,
    );
    const user = userEvent.setup();
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    await user.keyboard('{ArrowDown}{ArrowRight}');
    const innerRow = await screen.findByRole('menuitem', { name: 'Inner' });
    await waitFor(() => expect(document.activeElement).toBe(innerRow));
    await user.keyboard('{Escape}');
    const trigger = screen.getByRole('menuitem', { name: 'More' });
    await waitFor(() => expect(trigger.getAttribute('aria-disabled')).toBe('true'));
    // A press and the Right arrow on it open nothing while the submenu leaves.
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowRight', code: 'ArrowRight' });
    endExit();
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Inner' })).toBeNull());
    // Settled: the trigger is on again and opens the submenu.
    await waitFor(() => expect(trigger.getAttribute('aria-disabled')).toBeNull());
    trigger.focus();
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('menuitem', { name: 'Inner' })).toBeTruthy();
  });

  it('a submenu row is pressed again once the submenu is opened again', async () => {
    const inner = vi.fn();
    render(
      <ContextMenu items={[{ key: 'more', label: 'More', onSelect: vi.fn(), submenu: [{ key: 'inner', label: 'Inner', onSelect: inner }] }]}>
        <p>Alice was beginning to get very tired.</p>
      </ContextMenu>,
    );
    const user = userEvent.setup();
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    await user.keyboard('{ArrowDown}{ArrowRight}');
    await screen.findByRole('menuitem', { name: 'Inner' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Inner' })).toBeNull());
    screen.getByRole('menuitem', { name: 'More' }).focus();
    await user.keyboard('{ArrowRight}');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Inner' }));
    expect(inner).toHaveBeenCalledOnce();
  });

  it('an item is pressed again once the menu is opened again', async () => {
    const { end } = await escapeWhileLeaving();
    await end();
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    await screen.findByRole('menu');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Roll again' }));
    expect(rows[0]!.onSelect).toHaveBeenCalledOnce();
  });
});

// Alignment audit R3SC-2: the menu opened on top of the word that was clicked. Opened on text, it is placed against the text's box at the
// pointer's x, so it starts below the line (or above it), never on it. jsdom has no layout, so the browser's answers are stood in for.
// A chord (Ctrl, Alt or Meta held) is the page's, not the item's (#4195): Ctrl+Alt+Space with the menu open pressed "Bookmark here" on both builds.
describe('ContextMenu items with Ctrl, Alt or Meta held', () => {
  const chords = [
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Meta', { metaKey: true }],
    ['Ctrl+Alt', { ctrlKey: true, altKey: true }],
  ] as const;
  const keys = [
    ['Space', { key: ' ', code: 'Space' }],
    ['Enter', { key: 'Enter', code: 'Enter' }],
    ['NumpadEnter', { key: 'Enter', code: 'NumpadEnter' }],
  ] as const;
  const cases = chords.flatMap(([chord, modifiers]) => keys.map(([name, key]) => [`${chord}+${name}`, { ...key, ...modifiers }] as const));
  const rows = [
    { key: 'roll', label: 'Roll again', onSelect: vi.fn() },
    { key: 'mark', label: 'Mark as done', checked: false, onSelect: vi.fn() },
    { key: 'bookmark', label: 'Bookmark here', icon: 'bookmark' as const, onSelect: vi.fn() },
    { key: 'more', label: 'More', submenu: [{ key: 'inner', label: 'Inner', onSelect: vi.fn() }], onSelect: vi.fn() },
  ];

  async function openMenu() {
    rows.forEach((row) => row.onSelect.mockClear());
    render(
      <TooltipProvider>
        <ContextMenu items={rows}>
          <p>Alice was beginning to get very tired.</p>
        </ContextMenu>
      </TooltipProvider>,
    );
    fireEvent.contextMenu(screen.getByText(/Alice was beginning/));
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
  }

  it.each(cases)('an open menu takes no %s press on a row, a check row, an icon or a submenu row, and the menu stays open', async (_name, key) => {
    await openMenu();
    const pressable = [...screen.getAllByRole('menuitem'), ...screen.getAllByRole('menuitemcheckbox')];
    expect(pressable.length).toBeGreaterThanOrEqual(4);
    for (const item of pressable) {
      item.focus();
      fireEvent.keyDown(item, key);
      fireEvent.keyUp(item, key);
    }
    rows.forEach((row) => expect(row.onSelect).not.toHaveBeenCalled());
    expect(screen.queryByRole('menuitem', { name: 'Inner' })).toBeNull();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it.each(cases)("the %s key's default is stopped, so the page does not scroll and a native control is not pressed", async (_name, key) => {
    await openMenu();
    const item = screen.getByRole('menuitem', { name: 'Roll again' });
    item.focus();
    expect(fireEvent.keyDown(item, key)).toBe(false);
  });

  it.each(keys)('a plain %s press still runs a row', async (_name, key) => {
    await openMenu();
    const item = screen.getByRole('menuitem', { name: 'Roll again' });
    item.focus();
    fireEvent.keyDown(item, key);
    fireEvent.keyUp(item, key);
    expect(rows[0]!.onSelect).toHaveBeenCalledOnce();
  });
});

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
