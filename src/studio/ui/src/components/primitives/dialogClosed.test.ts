// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import './dialogClosed';

// A held Escape closes one layer (#3549 B3): its repeats are stopped before any listener, a new press always goes through. A stopped event reads
// `stopImmediatePropagation` call, which the test watches, so it needs no keydown listener of its own.
describe('held Escape', () => {
  const stop = vi.spyOn(Event.prototype, 'stopImmediatePropagation');
  afterEach(() => stop.mockClear());
  const stopped = (init: KeyboardEventInit): boolean => {
    stop.mockClear();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    return stop.mock.calls.length > 0;
  };

  it('stops the auto-repeats of Escape and lets a press through', () => {
    expect(stopped({ key: 'Escape' })).toBe(false);
    expect(stopped({ key: 'Escape', repeat: true })).toBe(true);
    expect(stopped({ key: 'Escape', repeat: true })).toBe(true);
    expect(stopped({ key: 'Escape' })).toBe(false);
  });

  it('leaves the repeat of any other key alone', () => {
    expect(stopped({ key: 'ArrowDown', repeat: true })).toBe(false);
  });
});

// A held Enter that answered a dialog does not press the control focus went back to (#3555 item 1).
describe('a held answer key after a dialog closed', () => {
  const press = (target: Element, init: KeyboardEventInit): boolean => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'alertdialog');
  const inside = document.createElement('button');
  dialog.append(inside);
  const outside = document.createElement('button');
  document.body.append(dialog, outside);

  it('stops the repeats of an Enter that began in a dialog once they land outside it, until the key comes up', () => {
    expect(press(inside, { key: 'Enter' })).toBe(false);
    expect(press(inside, { key: 'Enter', repeat: true })).toBe(false);
    expect(press(outside, { key: 'Enter', repeat: true })).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    expect(press(outside, { key: 'Enter', repeat: true })).toBe(false);
  });

  it('lets a new press and a repeat of a key that began outside through', () => {
    expect(press(outside, { key: 'Enter' })).toBe(false);
    expect(press(outside, { key: 'Enter', repeat: true })).toBe(false);
    press(inside, { key: ' ' });
    expect(press(outside, { key: ' ' })).toBe(false);
    expect(press(outside, { key: ' ', repeat: true })).toBe(false);
  });
});
