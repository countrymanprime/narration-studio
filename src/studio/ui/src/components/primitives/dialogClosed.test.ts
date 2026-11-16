import { afterEach, describe, expect, it, vi } from 'vitest';
import './dialogClosed';

// A held Escape closes one layer (#3549 B3): its repeats never reach a listener, a new press always does.
describe('held Escape', () => {
  const seen = vi.fn();
  afterEach(() => {
    document.removeEventListener('keydown', seen);
    seen.mockClear();
  });

  const press = (init: KeyboardEventInit) => document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

  it('lets a press of Escape through and stops its auto-repeats', () => {
    document.addEventListener('keydown', seen);
    press({ key: 'Escape' });
    expect(seen).toHaveBeenCalledTimes(1);
    press({ key: 'Escape', repeat: true });
    press({ key: 'Escape', repeat: true });
    expect(seen).toHaveBeenCalledTimes(1);
    press({ key: 'Escape' });
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('leaves the repeat of any other key alone', () => {
    document.addEventListener('keydown', seen);
    press({ key: 'ArrowDown', repeat: true });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
