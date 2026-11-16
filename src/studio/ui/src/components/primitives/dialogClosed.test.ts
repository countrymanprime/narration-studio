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
