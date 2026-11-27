/** A key's identity: its `code`, else its `key` (a synthetic event may have no code). */
export const keyOf = (event: { code: string; key: string }): string => event.code || event.key;

/** Whether a key press activates a button: Enter (either one) and Space. A synthetic event may carry only its `key`. */
export const activates = (event: { code: string; key: string }): boolean =>
  event.key === 'Enter' || event.key === ' ' || event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space';

/** A key that has repeated still counts as held, at a pointer press, when its last repeat was this recently, or within three of its own repeat gaps if that is longer (the slowest OS repeat settings, and Windows FilterKeys, repeat every one to two seconds). */
export const KEY_LIVE_MS = 700;

type HeldKeysOptions = {
  /**
   * What the window losing focus (alt-tab, a native dialog) or the page being hidden does to the keys held, whose keyup may never come: `'keep'` leaves them held, so their repeats, once focus is back, still press nothing,
   * until the keyup or a fresh press of the key; `'forget'` lets every one of them go.
   */
  onBlur: 'keep' | 'forget';
  /** A key was let go (its keyup, a fresh press of it, a pointer press that finds it lost, a blur that forgets): it is no longer held when this is called. Every keyup while attached calls it, a key never held too (a wait may be on it). */
  onUp: (code: string) => void;
};

/**
 * The keys held down, by their `code`, and the rule that only a held key's own repeats are cancelled: a key that went down while something was in progress (a hand-back, a dialog answered) must not act again by its
 * auto-repeat before it comes up, and no other key's repeat (a Backspace held in a field) is touched. A keyup that never arrives (the window lost focus, a native dialog) is let go by a fresh press of the key or by
 * `releaseLost`. The owner decides which keys to hold and what a release does (`onUp`); `attach` adds the document listeners and returns the function that removes them, so the owner holds the lifecycle.
 */
export class HeldKeys {
  private readonly options: HeldKeysOptions;
  /** Each held key, with when it went down. */
  private readonly held = new Map<string, number>();
  /** When each held key last repeated and how long it took (a key that has not yet has no entry): `releaseLost` lets go of one that repeated and then went silent. */
  private readonly heard = new Map<string, { at: number; gap: number }>();
  constructor(options: HeldKeysOptions) {
    this.options = options;
  }
  /** How many keys are held. */
  get size(): number {
    return this.held.size;
  }
  isHeld(code: string): boolean {
    return this.held.has(code);
  }
  /** A key went down: its repeats are cancelled (`swallowRepeat`) until it is let go. */
  hold(code: string): void {
    this.held.set(code, performance.now());
  }
  /** The key came up, or is let go for another reason. */
  release(code: string): void {
    this.held.delete(code);
    this.heard.delete(code);
    this.options.onUp(code);
  }
  /** A held key's own repeat is cancelled, and noted so `releaseLost` can tell a key still repeating from one gone silent; anything else is the event's own (it is left as it is). */
  swallowRepeat(event: KeyboardEvent): void {
    const code = keyOf(event);
    if (!event.repeat || !this.held.has(code)) return;
    const now = performance.now();
    this.heard.set(code, { at: now, gap: now - (this.heard.get(code)?.at ?? this.held.get(code) ?? now) });
    event.preventDefault();
    event.stopPropagation();
  }
  /**
   * A press with the pointer: a held key that repeated and then went silent (its keyup was lost) is let go. One that is still repeating is held, and so is one that has not repeated yet (the first repeat comes after the
   * system's delay, up to about a second).
   */
  releaseLost(): void {
    const now = performance.now();
    for (const [code, { at, gap }] of [...this.heard]) if (now - at > Math.max(KEY_LIVE_MS, 3 * gap)) this.release(code);
  }
  /**
   * Hears the keys, in the capture phase so before any command or field sees a repeat: `onKeyDown` is the owner's rule for a key going down (it may `hold`, `release` and `swallowRepeat`), a keyup lets the key go, and
   * `onLost` is called when the window loses focus or the page is hidden (after `'forget'` has let the keys go). Returns the function that removes the listeners.
   */
  attach(onKeyDown: (event: KeyboardEvent) => void, onLost: () => void): () => void {
    const up = (event: KeyboardEvent) => this.release(keyOf(event));
    const lost = () => {
      if (this.options.onBlur === 'forget') for (const code of [...this.held.keys()]) this.release(code);
      onLost();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') lost();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', up, true);
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', lost);
      document.removeEventListener('visibilitychange', hidden);
    };
  }
}
