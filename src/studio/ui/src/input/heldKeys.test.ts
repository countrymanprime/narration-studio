// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activates, HeldKeys, KEY_LIVE_MS, keyOf } from './heldKeys';

const press = (code: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true, ...init });

/** Whether a repeat (or the other event `init` makes) of `code` is cancelled. */
function cancelled(keys: HeldKeys, code: string, init: KeyboardEventInit = { repeat: true }): boolean {
  const event = press(code, init);
  keys.swallowRepeat(event);
  return event.defaultPrevented;
}

function make(onBlur: 'keep' | 'forget' = 'keep') {
  const onUp = vi.fn<(code: string) => void>();
  return { keys: new HeldKeys({ onBlur, onUp }), onUp };
}

/** Holds `code`, then lets it repeat `count` times, `gap` ms apart, the first after `gap` ms from its press. */
function repeating(keys: HeldKeys, code: string, gap: number, count: number): void {
  keys.hold(code);
  for (let i = 0; i < count; i++) {
    vi.advanceTimersByTime(gap);
    keys.swallowRepeat(press(code, { repeat: true }));
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('key identity', () => {
  it('is the code, else the key (a synthetic event may have no code)', () => {
    expect(keyOf({ code: 'Enter', key: 'Enter' })).toBe('Enter');
    expect(keyOf({ code: '', key: 'x' })).toBe('x');
  });

  it('activates a button with Enter (either one) and Space, and nothing else', () => {
    expect(activates({ code: 'Enter', key: 'Enter' })).toBe(true);
    expect(activates({ code: 'NumpadEnter', key: 'Enter' })).toBe(true);
    expect(activates({ code: 'Space', key: ' ' })).toBe(true);
    // A synthetic event may carry only its code, or only its key.
    expect(activates({ code: 'Enter', key: '' })).toBe(true);
    expect(activates({ code: 'NumpadEnter', key: '' })).toBe(true);
    expect(activates({ code: 'Space', key: '' })).toBe(true);
    expect(activates({ code: '', key: ' ' })).toBe(true);
    expect(activates({ code: '', key: 'Enter' })).toBe(true);
    expect(activates({ code: 'KeyA', key: 'a' })).toBe(false);
    expect(activates({ code: 'Tab', key: 'Tab' })).toBe(false);
  });
});

describe('held keys', () => {
  it('holds a key from its press until it is let go, and tells the owner after it is gone', () => {
    const { keys, onUp } = make();
    keys.hold('Enter');
    expect(keys.isHeld('Enter')).toBe(true);
    expect(keys.size).toBe(1);
    keys.release('Enter');
    expect(onUp).toHaveBeenCalledWith('Enter');
    expect(keys.isHeld('Enter')).toBe(false);
    expect(keys.size).toBe(0);
  });

  it('is already let go when the owner is told (the owner may look)', () => {
    const seen: boolean[] = [];
    const keys: HeldKeys = new HeldKeys({ onBlur: 'keep', onUp: (code) => seen.push(keys.isHeld(code)) });
    keys.hold('Space');
    keys.release('Space');
    expect(seen).toEqual([false]);
  });

  it('cancels only the held key own repeats', () => {
    const { keys } = make();
    keys.hold('Enter');
    expect(cancelled(keys, 'Enter')).toBe(true);
    // Another key's repeat (a Backspace held in a field) is its own, even while a held key's keyup is lost.
    expect(cancelled(keys, 'Backspace')).toBe(false);
    // A fresh press of the held key is not a repeat.
    expect(cancelled(keys, 'Enter', {})).toBe(false);
  });

  it('stops the event as well, so nothing after it hears the repeat', () => {
    const { keys } = make();
    keys.hold('Enter');
    const event = press('Enter', { repeat: true });
    const stop = vi.spyOn(event, 'stopPropagation');
    keys.swallowRepeat(event);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("lets a released key's repeats through again", () => {
    const { keys } = make();
    keys.hold('Enter');
    keys.release('Enter');
    expect(cancelled(keys, 'Enter')).toBe(false);
  });
});

describe('a keyup that never came: a pointer press lets go of a key gone silent', () => {
  it('holds a key that has not repeated yet, however long it has been down', () => {
    const { keys, onUp } = make();
    keys.hold('Enter');
    vi.advanceTimersByTime(60_000);
    keys.releaseLost();
    expect(keys.isHeld('Enter')).toBe(true);
    expect(onUp).not.toHaveBeenCalled();
  });

  it('holds a key that is still repeating, and lets go of one silent for more than the floor', () => {
    const { keys, onUp } = make();
    repeating(keys, 'Enter', 50, 3);
    expect(KEY_LIVE_MS).toBe(700);
    vi.advanceTimersByTime(700);
    keys.releaseLost();
    expect(keys.isHeld('Enter')).toBe(true);
    vi.advanceTimersByTime(1);
    keys.releaseLost();
    expect(keys.isHeld('Enter')).toBe(false);
    expect(onUp).toHaveBeenCalledWith('Enter');
  });

  it('keeps a steady repeater (50 ms apart) held, whenever the press comes', () => {
    const { keys } = make();
    repeating(keys, 'Space', 50, 20);
    keys.releaseLost();
    expect(keys.isHeld('Space')).toBe(true);
  });

  it('uses three of the key own gaps when that is longer than the floor', () => {
    const { keys } = make();
    // A slow repeater (the slowest OS settings, FilterKeys): the first repeat comes a second after the press, the next a second later.
    repeating(keys, 'Enter', 1000, 2);
    vi.advanceTimersByTime(2999);
    keys.releaseLost();
    expect(keys.isHeld('Enter')).toBe(true);
    vi.advanceTimersByTime(2);
    keys.releaseLost();
    expect(keys.isHeld('Enter')).toBe(false);
  });

  it('measures the gap from the last repeat, not from the press', () => {
    const { keys } = make();
    keys.hold('Enter');
    vi.advanceTimersByTime(5000);
    keys.swallowRepeat(press('Enter', { repeat: true }));
    // The first repeat's gap is 5 s (from the press), so 3 gaps is 15 s: still held after 14 s of silence.
    vi.advanceTimersByTime(14_000);
    keys.releaseLost();
    expect(keys.isHeld('Enter')).toBe(true);
    // The next repeat comes 1 s later: the gap is now 1 s, so 3 gaps is under the floor and the floor decides.
    keys.swallowRepeat(press('Enter', { repeat: true }));
    vi.advanceTimersByTime(1);
    keys.swallowRepeat(press('Enter', { repeat: true }));
    vi.advanceTimersByTime(KEY_LIVE_MS + 1);
    keys.releaseLost();
    expect(keys.isHeld('Enter')).toBe(false);
  });

  it('forgets how a key repeated once it is let go: pressed again, it has not repeated yet', () => {
    const { keys } = make();
    repeating(keys, 'Enter', 50, 2);
    keys.release('Enter');
    keys.hold('Enter');
    vi.advanceTimersByTime(60_000);
    keys.releaseLost();
    expect(keys.isHeld('Enter')).toBe(true);
  });

  it('lets go of each silent key and only those', () => {
    const { keys, onUp } = make();
    repeating(keys, 'Enter', 50, 2);
    vi.advanceTimersByTime(KEY_LIVE_MS + 1);
    repeating(keys, 'Space', 50, 2);
    keys.releaseLost();
    expect(onUp.mock.calls).toEqual([['Enter']]);
    expect(keys.isHeld('Space')).toBe(true);
  });
});

describe('attach', () => {
  it('hears a key before the target and what lies between (the capture phase), and stops it from reaching them', () => {
    const { keys } = make();
    const order: string[] = [];
    const detach = keys.attach(
      (event) => {
        order.push('keys');
        event.stopPropagation();
      },
      () => {},
    );
    // A listener on the event's own target is the one a bubble listener on the document would be too late for.
    const target = () => order.push('target');
    document.body.addEventListener('keydown', target);
    document.body.dispatchEvent(press('KeyA'));
    expect(order).toEqual(['keys']);
    document.body.removeEventListener('keydown', target);
    detach();
  });

  it('lets a key go at its keyup before the target can stop it (the capture phase)', () => {
    const { keys, onUp } = make();
    const detach = keys.attach(
      () => {},
      () => {},
    );
    const stop = (event: Event) => event.stopPropagation();
    document.body.addEventListener('keyup', stop);
    keys.hold('Enter');
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter', bubbles: true }));
    expect(onUp).toHaveBeenCalledWith('Enter');
    expect(keys.isHeld('Enter')).toBe(false);
    document.body.removeEventListener('keyup', stop);
    detach();
  });

  it('lets a key go at its keyup, even one never held (a wait may be on it)', () => {
    const { keys, onUp } = make();
    const detach = keys.attach(
      () => {},
      () => {},
    );
    keys.hold('Enter');
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter', bubbles: true }));
    expect(keys.isHeld('Enter')).toBe(false);
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', key: 'a', bubbles: true }));
    expect(onUp.mock.calls).toEqual([['Enter'], ['KeyA']]);
    detach();
  });

  it("keeps the keys held when the window loses focus ('keep'), and says so", () => {
    const { keys, onUp } = make('keep');
    const onLost = vi.fn();
    const detach = keys.attach(() => {}, onLost);
    keys.hold('Enter');
    window.dispatchEvent(new Event('blur'));
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(keys.isHeld('Enter')).toBe(true);
    expect(onUp).not.toHaveBeenCalled();
    // Its repeats, once focus is back, still press nothing.
    expect(cancelled(keys, 'Enter')).toBe(true);
    detach();
  });

  it("lets every key go when the window loses focus ('forget'), then says so", () => {
    const { keys, onUp } = make('forget');
    const onLost = vi.fn(() => expect(keys.size).toBe(0));
    const detach = keys.attach(() => {}, onLost);
    keys.hold('Enter');
    keys.hold('Space');
    window.dispatchEvent(new Event('blur'));
    expect(onUp.mock.calls).toEqual([['Enter'], ['Space']]);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(cancelled(keys, 'Enter')).toBe(false);
    detach();
  });

  it('treats a hidden page as the window losing focus, and a visible one as nothing', () => {
    const { keys } = make('forget');
    const onLost = vi.fn();
    const detach = keys.attach(() => {}, onLost);
    keys.hold('Enter');
    const state = vi.spyOn(document, 'visibilityState', 'get');
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onLost).not.toHaveBeenCalled();
    expect(keys.isHeld('Enter')).toBe(true);
    state.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(keys.isHeld('Enter')).toBe(false);
    state.mockRestore();
    detach();
  });

  it('leaves no listener behind once detached', () => {
    const { keys } = make();
    const onKeyDown = vi.fn();
    const onLost = vi.fn();
    const adds = vi.spyOn(document, 'addEventListener');
    const winAdds = vi.spyOn(window, 'addEventListener');
    const removes = vi.spyOn(document, 'removeEventListener');
    const winRemoves = vi.spyOn(window, 'removeEventListener');
    const detach = keys.attach(onKeyDown, onLost);
    const added = [...adds.mock.calls, ...winAdds.mock.calls].map(([type]) => type).sort();
    expect(added).toEqual(['blur', 'keydown', 'keyup', 'visibilitychange']);
    detach();
    const removed = [...removes.mock.calls, ...winRemoves.mock.calls].map(([type]) => type).sort();
    expect(removed).toEqual(added);
    keys.hold('Enter');
    document.body.dispatchEvent(press('Enter'));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter', bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onLost).not.toHaveBeenCalled();
    expect(keys.isHeld('Enter')).toBe(true);
    vi.restoreAllMocks();
  });
});
