// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePedalSpace } from './usePedalSpace';

function Harness({ toggle, running = false }: { toggle: () => unknown; running?: boolean }) {
  usePedalSpace(toggle, () => running);
  return (
    <div>
      <button type="button">Chapter list</button>
      <button type="button">Record</button>
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
function pressSpace(target: HTMLElement): KeyboardEvent {
  target.focus();
  const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
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
});
