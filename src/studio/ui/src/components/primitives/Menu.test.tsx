// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from './Menu';

afterEach(cleanup);

const items = ['Character', 'Location', 'Organization'].map((label) => ({ key: label, label, onSelect: vi.fn() }));

function renderMenu(disabled = false) {
  items.forEach((item) => item.onSelect.mockClear());
  return render(
    <div>
      <Menu items={items} disabled={disabled}>
        Character
      </Menu>
      <button>After</button>
    </div>,
  );
}

describe('Menu', () => {
  it('is a menu button that opens a menu of items with a click', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Character' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    await user.click(trigger);
    expect(await screen.findAllByRole('menuitem')).toHaveLength(3);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('moves with the arrow keys, selects with Enter, closes and returns focus to the button', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Character' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await screen.findAllByRole('menuitem');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Character'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Location');
    await user.keyboard('{Enter}');
    expect(items[1].onSelect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes on Escape and selects on a click', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Character' }));
    await screen.findAllByRole('menuitem');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Character' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Organization' }));
    expect(items[2].onSelect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    renderMenu(true);
    await user.click(screen.getByRole('button', { name: 'Character' }));
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('takes an explicit accessible name for an icon-only trigger', () => {
    render(
      <Menu items={items} label="Choose a source">
        <span aria-hidden="true">⟳</span>
      </Menu>,
    );
    expect(screen.getByRole('button', { name: 'Choose a source' })).toBeTruthy();
  });
});

// Sections: a heading over its items, and a choice per section, several at once (checkboxes) or one of them (radios). Choosing keeps the
// menu open, so a narrator can set several filters in one visit.
describe('Menu sections', () => {
  function renderSections() {
    const kinds = { Character: vi.fn(), Place: vi.fn() };
    const shows = { all: vi.fn(), review: vi.fn() };
    render(
      <Menu
        label="Filter entries"
        sections={[
          {
            key: 'kind',
            label: 'Kind',
            select: 'many',
            items: [
              { key: 'Character', label: 'Character', checked: true, trailing: 5, onSelect: kinds.Character },
              { key: 'Place', label: 'Place', checked: false, trailing: 2, onSelect: kinds.Place },
            ],
          },
          {
            key: 'show',
            label: 'Show',
            select: 'one',
            items: [
              { key: 'all', label: 'All entries', checked: false, onSelect: shows.all },
              { key: 'review', label: 'Needs review', checked: true, onSelect: shows.review },
            ],
          },
        ]}
      >
        Filter
      </Menu>,
    );
    return { kinds, shows };
  }

  it('draws each section under its heading, checkboxes for many and radios for one, with their state', async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole('button', { name: 'Filter entries' }));
    const boxes = await screen.findAllByRole('menuitemcheckbox');
    expect(boxes.map((box) => [box.textContent, box.getAttribute('aria-checked')])).toEqual([
      ['Character, 5', 'true'],
      ['Place, 2', 'false'],
    ]);
    const radios = screen.getAllByRole('menuitemradio');
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(screen.getByRole('group', { name: 'Kind' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Show' })).toBeTruthy();
  });

  it('calls the item chosen and stays open', async () => {
    const user = userEvent.setup();
    const { kinds, shows } = renderSections();
    await user.click(screen.getByRole('button', { name: 'Filter entries' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /Place/ }));
    expect(kinds.Place).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('menuitemradio', { name: 'All entries' }));
    expect(shows.all).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeTruthy();
  });
});

it('closes on a choice in a section that asks to', async () => {
  const user = userEvent.setup();
  const pick = vi.fn();
  render(
    <Menu
      label="Sort"
      sections={[
        {
          key: 'order',
          select: 'one',
          closeOnSelect: true,
          items: [
            { key: 'name', label: 'Name', checked: true, onSelect: vi.fn() },
            { key: 'kind', label: 'Kind', checked: false, onSelect: pick },
          ],
        },
      ]}
    >
      Sort
    </Menu>,
  );
  await user.click(screen.getByRole('button', { name: 'Sort' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'Kind' }));
  expect(pick).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
});

describe('Menu: an item with a reason it is off', () => {
  it('keeps the item in the menu, off, with its reason as the description, and a press does nothing and leaves the menu open', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Menu items={[{ key: 'a', label: 'Create regions', disabledReason: 'REAPER is not connected.', onSelect }]}>Tools</Menu>);
    await user.click(screen.getByRole('button', { name: 'Tools' }));
    const item = await screen.findByRole('menuitem', { name: /Create regions/ });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('REAPER is not connected.')).toBeTruthy();
    await user.click(item);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('menuitem', { name: /Create regions/ })).toBeTruthy();
  });

  it('can still be reached with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Menu items={[{ key: 'a', label: 'Off', disabledReason: 'Why not.', onSelect: vi.fn() }]}>Tools</Menu>);
    await user.click(screen.getByRole('button', { name: 'Tools' }));
    await screen.findByRole('menuitem', { name: /Off/ });
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('Menu: a long reason', () => {
  it('wraps a reason with no break in it inside the popup instead of running out of it', async () => {
    const user = userEvent.setup();
    const reason = `The REAPER project could not be read: C:\\${'Projects\\'.repeat(40)}Book.rpp`;
    render(<Menu items={[{ key: 'a', label: 'Off', disabledReason: reason, onSelect: vi.fn() }]}>Tools</Menu>);
    await user.click(screen.getByRole('button', { name: 'Tools' }));
    const text = await screen.findByText(reason);
    expect(text.className).toMatch(/overflow-wrap:anywhere/);
  });
});

describe('Menu: pageMenu', () => {
  it('draws its popup inside the page main, where the default menu draws it in the body', async () => {
    const user = userEvent.setup();
    render(
      <main>
        <Menu pageMenu items={[{ key: 'a', label: 'One', onSelect: vi.fn() }]}>
          Page tools
        </Menu>
      </main>,
    );
    await user.click(screen.getByRole('button', { name: 'Page tools' }));
    expect((await screen.findByRole('menu')).closest('main')).toBeTruthy();
  });

  it('draws its popup outside any main by default', async () => {
    const user = userEvent.setup();
    render(
      <main>
        <Menu items={[{ key: 'a', label: 'One', onSelect: vi.fn() }]}>Tools</Menu>
      </main>,
    );
    await user.click(screen.getByRole('button', { name: 'Tools' }));
    expect((await screen.findByRole('menu')).closest('main')).toBeNull();
  });
});

describe('Menu: clipped labels (#3380)', () => {
  // An item's label is clipped to the menu's width, so the whole label is its title, in a plain item and in a choosing one.
  it('gives each item label its whole text as a title', async () => {
    const user = userEvent.setup();
    render(
      <Menu
        label="Sort"
        sections={[
          { key: 'go', items: [{ key: 'open', label: 'Open the chapter in Editing', onSelect: vi.fn() }] },
          { key: 'order', select: 'one', items: [{ key: 'name', label: 'Sort by chapter name', checked: true, onSelect: vi.fn() }] },
        ]}
      >
        Sort
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    await screen.findAllByRole('menuitem');
    expect(document.querySelector('[title="Open the chapter in Editing"]')).toBeTruthy();
    expect(document.querySelector('[title="Sort by chapter name"]')).toBeTruthy();
  });
});

// A menu that has been closed stays drawn for its exit (120 ms): the highlighted item still has focus, so the Space of a chord or the Enter of a
// footswitch pressed inside the exit would press it (#4183: the Booth's DAW tools, Story Bible and More actions opened a dialog on an Enter at 20 ms).
describe('Menu items while it leaves', () => {
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

  // The menu is opened, left with Escape, and its exit is held until `end()`, as the 120 ms exit is while a key arrives.
  async function escapeWhileLeaving(ui: ReactElement, trigger: string) {
    let endExit: () => void = () => {};
    const finished = new Promise<void>((resolve) => (endExit = resolve));
    proto.getAnimations = () => [{ finished }];
    render(ui);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: trigger }));
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
    items.forEach((item) => item.onSelect.mockClear());
    const { end } = await escapeWhileLeaving(<Menu items={items}>Character</Menu>, 'Character');
    const item = screen.getAllByRole('menuitem')[0]!;
    fireEvent.keyDown(item, key);
    fireEvent.keyUp(item, key);
    fireEvent.click(item);
    await end();
    items.forEach((entry) => expect(entry.onSelect).not.toHaveBeenCalled());
  });

  it.each(keys)('a checkbox and a radio item take no %s press while the menu is leaving', async (_name, key) => {
    const choose = vi.fn();
    const { end } = await escapeWhileLeaving(
      <Menu
        label="Filter entries"
        sections={[
          { key: 'kind', select: 'many', items: [{ key: 'Place', label: 'Place', checked: false, onSelect: choose }] },
          { key: 'show', select: 'one', items: [{ key: 'all', label: 'All entries', checked: false, onSelect: choose }] },
        ]}
      >
        Filter
      </Menu>,
      'Filter entries',
    );
    for (const item of [...screen.getAllByRole('menuitemcheckbox'), ...screen.getAllByRole('menuitemradio')]) {
      fireEvent.keyDown(item, key);
      fireEvent.keyUp(item, key);
      fireEvent.click(item);
    }
    await end();
    expect(choose).not.toHaveBeenCalled();
  });

  it.each(keys)('a plain item of a section takes no %s press while the menu is leaving', async (_name, key) => {
    const choose = vi.fn();
    const { end } = await escapeWhileLeaving(
      <Menu label="Sort" sections={[{ key: 'tools', label: 'Tools', items: [{ key: 'scan', label: 'Scan the manuscript', onSelect: choose }] }]}>
        Sort
      </Menu>,
      'Sort',
    );
    const item = screen.getByRole('menuitem', { name: 'Scan the manuscript' });
    fireEvent.keyDown(item, key);
    fireEvent.keyUp(item, key);
    fireEvent.click(item);
    await end();
    expect(choose).not.toHaveBeenCalled();
  });

  it('an item is pressed again once the menu is opened again during its exit', async () => {
    items.forEach((item) => item.onSelect.mockClear());
    const { end, user } = await escapeWhileLeaving(<Menu items={items}>Character</Menu>, 'Character');
    await user.click(screen.getByRole('button', { name: 'Character' }));
    await waitFor(() => expect(leavingMenu()).toBeNull());
    await user.click(screen.getAllByRole('menuitem')[0]!);
    expect(items[0]!.onSelect).toHaveBeenCalledOnce();
    await end();
  });
});

// A chord (Ctrl, Alt or Meta held) is the page's, not the item's: Base UI presses a focused item on the keydown of Space or Enter whatever else is held, and the
// Booth's Ctrl+Alt+Space with the chapter list open picked the highlighted chapter (#4195). The menu stays open and the key still reaches the page.
describe('Menu items with Ctrl, Alt or Meta held', () => {
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

  async function openFocused(ui: ReactElement, trigger: string) {
    render(ui);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: trigger }));
    const item = (await screen.findAllByRole('menuitem'))[0]!;
    item.focus();
    return item;
  }

  it.each(cases)("an open menu's plain item takes no %s press, and the key's default is stopped", async (_name, key) => {
    items.forEach((item) => item.onSelect.mockClear());
    const item = await openFocused(<Menu items={items}>Character</Menu>, 'Character');
    // `fireEvent` answers false when the keydown's default was prevented (Space would scroll the page, Enter would press a native control).
    expect(fireEvent.keyDown(item, key)).toBe(false);
    fireEvent.keyUp(item, key);
    items.forEach((entry) => expect(entry.onSelect).not.toHaveBeenCalled());
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it.each(cases)("an open menu's checkbox, radio and sectioned plain item take no %s press", async (_name, key) => {
    const choose = vi.fn();
    render(
      <Menu
        label="Filter entries"
        sections={[
          { key: 'kind', select: 'many', items: [{ key: 'Place', label: 'Place', checked: false, onSelect: choose }] },
          { key: 'show', select: 'one', items: [{ key: 'all', label: 'All entries', checked: false, onSelect: choose }] },
          { key: 'tools', label: 'Tools', items: [{ key: 'scan', label: 'Scan the manuscript', onSelect: choose }] },
        ]}
      >
        Filter
      </Menu>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Filter entries' }));
    const rows = [
      await screen.findByRole('menuitemcheckbox'),
      screen.getByRole('menuitemradio'),
      screen.getByRole('menuitem', { name: 'Scan the manuscript' }),
    ];
    for (const row of rows) {
      row.focus();
      fireEvent.keyDown(row, key);
      fireEvent.keyUp(row, key);
    }
    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it.each(keys)("an open menu's items still take a plain %s press", async (_name, key) => {
    items.forEach((item) => item.onSelect.mockClear());
    const item = await openFocused(<Menu items={items}>Character</Menu>, 'Character');
    fireEvent.keyDown(item, key);
    fireEvent.keyUp(item, key);
    expect(items[0]!.onSelect).toHaveBeenCalledOnce();
  });

  it('a Shift press is still a press: only Ctrl, Alt and Meta make a chord', async () => {
    items.forEach((item) => item.onSelect.mockClear());
    const item = await openFocused(<Menu items={items}>Character</Menu>, 'Character');
    fireEvent.keyDown(item, { key: 'Enter', code: 'Enter', shiftKey: true });
    expect(items[0]!.onSelect).toHaveBeenCalledOnce();
  });
});
