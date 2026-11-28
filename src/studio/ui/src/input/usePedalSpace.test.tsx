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
