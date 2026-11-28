// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePedalSpace } from './usePedalSpace';

function Harness({ toggle, running = false }: { toggle: (closedAPopup: boolean) => unknown; running?: boolean }) {
  usePedalSpace(toggle, () => running);
  return (
    <div>
      <button type="button">Chapter list</button>
      <button type="button">Record</button>
      <input type="radio" aria-label="Main button choice" />
      <div data-toast-region>
        <div data-tone="error">
          <button type="button">Retry</button>
          <button type="button" aria-label="Dismiss message">
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

/** A Space press on the focused control, as the browser delivers it to the document's capture listener first. */
function pressSpace(target: HTMLElement, code = 'Space'): KeyboardEvent {
  target.focus();
  const event = new KeyboardEvent('keydown', { key: code === 'Space' ? ' ' : 'Enter', code, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('the pedal Space (#4094)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('gives a focused page button Space to the take, and does not press the button', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<Harness toggle={toggle} />);
    const event = pressSpace(getByRole('button', { name: 'Chapter list' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('tells the take whether the Space closed an open popup (it sent Escape to it), so the take can mark that popup as left to the page', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<Harness toggle={toggle} />);
    pressSpace(getByRole('button', { name: 'Chapter list' }));
    expect(toggle).toHaveBeenLastCalledWith(false);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('button');
    item.textContent = 'Item';
    menu.append(item);
    document.body.append(menu);
    pressSpace(item);
    expect(toggle).toHaveBeenLastCalledWith(true);
  });

  it.each([['Retry'], ['Dismiss message']])('leaves Space to the toast button %s: it presses the button and starts no take', (name) => {
    const toggle = vi.fn();
    const { getByRole } = render(<Harness toggle={toggle} />);
    const event = pressSpace(getByRole('button', { name }));
    expect(toggle).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops a running take from a toast button: the pedal always stops the take', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<Harness toggle={toggle} running />);
    const event = pressSpace(getByRole('button', { name: 'Retry' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('takes a second Space within a moment of one that pressed a toast button as the same tap, and starts no take', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<Harness toggle={toggle} />);
    pressSpace(getByRole('button', { name: 'Retry' }));
    const second = pressSpace(getByRole('button', { name: 'Chapter list' }));
    expect(toggle).not.toHaveBeenCalled();
    expect(second.defaultPrevented).toBe(true);
  });

  it('swallows an Enter and a numpad Enter on the page just after a toast press, as the same tap', () => {
    for (const code of ['Enter', 'NumpadEnter']) {
      const toggle = vi.fn();
      const { getByRole, unmount } = render(<Harness toggle={toggle} />);
      pressSpace(getByRole('button', { name: 'Retry' }), code);
      document.body.focus();
      const second = pressSpace(document.body, code);
      expect(second.defaultPrevented).toBe(true);
      expect(toggle).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('leaves a Space just after a toast press to a radio and to the next toast button', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<Harness toggle={toggle} />);
    pressSpace(getByRole('button', { name: 'Retry' }));
    const radio = pressSpace(getByRole('radio', { name: 'Main button choice' }));
    const dismiss = pressSpace(getByRole('button', { name: 'Dismiss message' }));
    expect(radio.defaultPrevented).toBe(false);
    expect(dismiss.defaultPrevented).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('swallows a Space or an Enter on the Record button just after a toast press, as the same tap', () => {
    for (const code of ['Space', 'Enter', 'NumpadEnter']) {
      const toggle = vi.fn();
      const { getByRole, unmount } = render(<Harness toggle={toggle} />);
      pressSpace(getByRole('button', { name: 'Retry' }), code);
      const second = pressSpace(getByRole('button', { name: 'Record' }), code);
      expect(second.defaultPrevented).toBe(true);
      expect(toggle).not.toHaveBeenCalled();
      unmount();
    }
  });
});

// A footswitch Enter on an item of a menu that is leaving, or on that menu's own popup: the item is off (`aria-disabled`, `useLeaving`) and presses nothing, and the router holds Enter for a control in a closing popup, so with a take
// running the pedal's hook stops it, and with none it stays swallowed (#4183).
describe('the pedal Enter on an item of a menu that is leaving, or on its popup (#4183)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function LeavingMenu({ toggle, running, leaving = true, inert = true }: { toggle: () => unknown; running: boolean; leaving?: boolean; inert?: boolean }) {
    usePedalSpace(toggle, () => running);
    return (
      <div role="menu" {...(leaving ? { 'data-ending-style': '' } : {})}>
        <div role="menuitem" tabIndex={-1} aria-label="Roll again" {...(inert ? { 'aria-disabled': 'true' } : {})} />
      </div>
    );
  }
  const press = (target: HTMLElement, code: string, repeat = false, modifiers: KeyboardEventInit = {}): KeyboardEvent => {
    target.focus();
    const event = new KeyboardEvent('keydown', {
      key: code === 'Space' ? ' ' : code.startsWith('Arrow') || code === 'Escape' ? code : 'Enter',
      code,
      bubbles: true,
      cancelable: true,
      repeat,
      ...modifiers,
    });
    target.dispatchEvent(event);
    return event;
  };

  it.each([['ArrowDown'], ['Escape'], ['KeyR']])('%s on an inert item of a menu that is leaving is not a take key: nothing is toggled', (code) => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingMenu toggle={toggle} running />);
    const event = press(getByRole('menuitem'), code);
    expect(toggle).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([['ctrlKey'], ['altKey'], ['metaKey']])("Enter with %s held is not the pedal's: nothing is toggled and the key is left alone", (modifier) => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingMenu toggle={toggle} running />);
    const event = press(getByRole('menuitem'), 'Enter', false, { [modifier]: true });
    expect(toggle).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('Space on an inert item of a menu that is leaving still toggles exactly once, through the Space path, and its key up is swallowed', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingMenu toggle={toggle} running />);
    const item = getByRole('menuitem');
    const down = press(item, 'Space');
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(down.defaultPrevented).toBe(true);
    const up = new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    item.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('Enter on an inert item of a menu that is leaving stops the take once and tells the take no popup was closed (the Space path does not also run)', () => {
    // Composes with the take-key claim (#4181): this branch is a stop, so `toggle(false)` (no popup was closed, nothing to mark) and nothing else toggles.
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingMenu toggle={toggle} running />);
    const event = press(getByRole('menuitem'), 'Enter');
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Shift+Enter is not a take key on the page, so it is not the pedal's here either", () => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingMenu toggle={toggle} running />);
    const event = press(getByRole('menuitem'), 'Enter', false, { shiftKey: true });
    expect(toggle).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  // A menu opened by the pointer keeps focus on its own popup until an arrow moves it onto a row.
  function LeavingPopup({ toggle, running, leaving = true }: { toggle: () => unknown; running: boolean; leaving?: boolean }) {
    usePedalSpace(toggle, () => running);
    return <div role="menu" tabIndex={-1} aria-label="Word menu" {...(leaving ? { 'data-ending-style': '' } : {})} />;
  }

  it.each(['Enter', 'NumpadEnter'])('%s on the popup of a menu that is leaving, with no item focused, stops a take that runs', (code) => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingPopup toggle={toggle} running />);
    const event = press(getByRole('menu'), code);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Enter on the popup of a menu that is leaving starts no take when none runs', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingPopup toggle={toggle} running={false} />);
    press(getByRole('menu'), 'Enter');
    expect(toggle).not.toHaveBeenCalled();
  });

  it('Enter on the popup of a menu that is still open is left to the menu', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingPopup toggle={toggle} running leaving={false} />);
    const event = press(getByRole('menu'), 'Enter');
    expect(toggle).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('an Enter that lands after the pick opened a dialog still stops the take: this branch only ever stops one, so no modal check holds it back', () => {
    const toggle = vi.fn();
    const { getByRole } = render(
      <>
        <div role="alertdialog" aria-label="Roll again from ¶ 14?" />
        <LeavingMenu toggle={toggle} running />
      </>,
    );
    press(getByRole('menuitem'), 'Enter');
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it.each(['Enter', 'NumpadEnter'])('%s stops a take that runs', (code) => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingMenu toggle={toggle} running />);
    const event = press(getByRole('menuitem'), code);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each(['Enter', 'NumpadEnter'])('%s starts no take when none runs: it stays swallowed', (code) => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingMenu toggle={toggle} running={false} />);
    press(getByRole('menuitem'), code);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('a repeat of the key stops the take once', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingMenu toggle={toggle} running />);
    press(getByRole('menuitem'), 'Enter');
    press(getByRole('menuitem'), 'Enter', true);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('an item that is unavailable in a menu that is still open keeps its Enter', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingMenu toggle={toggle} running leaving={false} />);
    const event = press(getByRole('menuitem'), 'Enter');
    expect(toggle).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('an item that is not inert keeps its Enter, even while its menu leaves', () => {
    const toggle = vi.fn();
    const { getByRole } = render(<LeavingMenu toggle={toggle} running inert={false} />);
    press(getByRole('menuitem'), 'Enter');
    expect(toggle).not.toHaveBeenCalled();
  });
});
