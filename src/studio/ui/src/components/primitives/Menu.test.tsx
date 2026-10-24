// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
