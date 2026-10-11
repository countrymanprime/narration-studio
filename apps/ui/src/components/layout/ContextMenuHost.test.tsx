// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerContextProvider, type ContextProvider } from '../../registries/context';
import { ContextMenu } from '../primitives/ContextMenu';
import { ContextMenuHost } from './ContextMenuHost';

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanup();
  cleanups.forEach((fn) => fn());
  cleanups = [];
  vi.restoreAllMocks();
});

const word = (onSelect = vi.fn()): ContextProvider => ({
  match: (target) => target.closest('[data-word]') !== null,
  items: () => [
    { key: 'effect', label: 'Add an effect', onSelect },
    { key: 'chain', label: 'Put an FX chain on the track', unavailable: 'REAPER is not connected.', onSelect: vi.fn() },
  ],
});
const provide = (provider: ContextProvider) => cleanups.push(registerContextProvider(provider));
const tail = [{ key: 'jump', label: 'Jump menu', onSelect: vi.fn() }];

function mount(props: { tail?: typeof tail; fallback?: (target: Element) => typeof tail } = {}) {
  render(
    <main tabIndex={-1}>
      <ContextMenuHost {...props}>
        <p data-word>Alice</p>
        <p>Empty space</p>
        <input aria-label="Name" />
        <textarea aria-label="Notes" />
        <select aria-label="Pick">
          <option>a</option>
        </select>
        <div contentEditable suppressContentEditableWarning>
          Editable
        </div>
        <ul role="listbox" aria-label="List" aria-activedescendant="row-2" tabIndex={0}>
          <li role="option" id="row-1" aria-selected="false" data-word>
            One
          </li>
          <li role="option" id="row-2" aria-selected="true" data-word>
            Two
          </li>
        </ul>
        <button>Plain button</button>
      </ContextMenuHost>
    </main>,
  );
}

// Fires a contextmenu and reports whether the browser's menu was left alone (not default-prevented).
const rightClick = (element: Element, init: MouseEventInit = { button: 2 }) => {
  const event = createEvent.contextMenu(element, { bubbles: true, cancelable: true, ...init });
  fireEvent(element, event);
  return event.defaultPrevented;
};

describe('ContextMenuHost', () => {
  it('right-click-shows-the-providers-items-then-the-tail', async () => {
    provide(word());
    mount({ tail });
    expect(rightClick(screen.getByText('Alice'))).toBe(true);
    const labels = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(labels).toEqual(['Add an effect', expect.stringContaining('Put an FX chain'), 'Jump menu']);
  });

  it('runs the chosen item', async () => {
    const onSelect = vi.fn();
    provide(word(onSelect));
    mount();
    rightClick(screen.getByText('Alice'));
    await userEvent.setup().click(await screen.findByRole('menuitem', { name: 'Add an effect' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('a-disabled-item-shows-its-reason', async () => {
    provide(word());
    mount();
    rightClick(screen.getByText('Alice'));
    const chain = await screen.findByRole('menuitem', { name: /Put an FX chain/ });
    expect(chain.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('REAPER is not connected.')).toBeTruthy();
    await userEvent.setup().click(chain);
    expect(chain.getAttribute('aria-disabled')).toBe('true');
  });

  it.each([
    ['input', () => screen.getByLabelText('Name')],
    ['textarea', () => screen.getByLabelText('Notes')],
    ['select', () => screen.getByLabelText('Pick')],
    ['contenteditable', () => screen.getByText('Editable')],
  ])('text-fields-keep-the-browser-menu: %s', (_name, find) => {
    provide({ match: () => true, items: () => [{ key: 'x', label: 'X', onSelect: vi.fn() }] });
    mount({ tail, fallback: () => tail });
    expect(rightClick(find())).toBe(false);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('no-match-and-no-fallback-leaves-the-browser-menu', () => {
    provide(word());
    mount({ tail });
    expect(rightClick(screen.getByText('Empty space'))).toBe(false);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('shows the fallback, then the tail, when no provider matches', async () => {
    provide(word());
    mount({ tail, fallback: () => [{ key: 'goto', label: 'Go to', onSelect: vi.fn() }] });
    expect(rightClick(screen.getByText('Empty space'))).toBe(true);
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Go to', 'Jump menu']);
  });

  it('menu-key-opens-at-the-active-descendant', async () => {
    const seen: string[] = [];
    provide({
      match: (target) => target.closest('[data-word]') !== null,
      items: (target) => {
        seen.push(target.id);
        return [{ key: 'k', label: `Menu for ${target.id}`, onSelect: vi.fn() }];
      },
    });
    mount();
    const list = screen.getByRole('listbox');
    list.focus();
    vi.spyOn(document.getElementById('row-2')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 60, 100, 20));
    // The Menu key and Shift+F10 send a contextmenu event with button 0 to the focused element.
    rightClick(list, { button: 0 });
    expect(await screen.findByRole('menuitem', { name: 'Menu for row-2' })).toBeTruthy();
    expect(seen).toEqual(['row-2']);
    const positioner = screen.getByRole('menu').parentElement as HTMLElement;
    await waitFor(() => expect(positioner.style.transform + positioner.style.top + positioner.style.left).not.toBe(''));
  });

  it('without an active descendant the menu is for the focused element', async () => {
    provide({ match: () => true, items: (target) => [{ key: 'k', label: `Menu for ${target.tagName}`, onSelect: vi.fn() }] });
    mount();
    screen.getByRole('button', { name: 'Plain button' }).focus();
    rightClick(document.activeElement!, { button: 0 });
    expect(await screen.findByRole('menuitem', { name: 'Menu for BUTTON' })).toBeTruthy();
  });

  it('keyboard open with nothing to show leaves the browser menu', () => {
    mount();
    screen.getByRole('button', { name: 'Plain button' }).focus();
    expect(rightClick(document.activeElement!, { button: 0 })).toBe(false);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('escape-closes-and-focus-returns', async () => {
    provide(word());
    mount();
    const button = screen.getByRole('button', { name: 'Plain button' });
    button.focus();
    rightClick(screen.getByText('Alice'));
    await screen.findAllByRole('menuitem');
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    expect(document.activeElement === button || document.activeElement === document.body || document.activeElement?.closest('main') !== null).toBe(true);
  });

  it('no-document-listener: adds nothing to document or window beyond what the bare primitive adds', () => {
    const names = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => String(call[0]));
    const docSpy = vi.spyOn(document, 'addEventListener');
    const winSpy = vi.spyOn(window, 'addEventListener');
    const bare = render(
      <main>
        <ContextMenu items={[]}>
          <p>x</p>
        </ContextMenu>
      </main>,
    );
    const bareDoc = names(docSpy).sort();
    const bareWin = names(winSpy).sort();
    bare.unmount();
    docSpy.mockClear();
    winSpy.mockClear();
    mount({ tail });
    expect(names(docSpy).sort()).toEqual(bareDoc);
    expect(names(winSpy).sort()).toEqual(bareWin);
  });
});
