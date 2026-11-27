import { TOAST_ROOM_EVENT } from '../../hooks/useToastClearance';
import { openModalLayer, takesTypedText } from '../../input/targets';
import { HIT_AREA } from './hitArea';
import { StatusBadge } from './StatusBadge';
import { TooltipTarget } from './Tooltip';
import { formatCount, plural } from '../../plural';
import { textDirection } from '../../visibleText';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faCircleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastTone = 'info' | 'error';
/** A toast's one action (for example Undo): its own label, run when pressed, which also dismisses the toast. */
export type ToastAction = { label: string; onAction: () => void };
/** The Retry a failure toast carries where repeating the action is safe (a start that the host guards or an idempotent save). */
export const retryAction = (retry: () => void): ToastAction => ({ label: 'Retry', onAction: retry });
/** `durationMs` is how long a message stays when it needs a different time than its tone's (an Undo the narrator may want ten seconds for); `toastLifetimeMs` bounds it. */
export type ToastMessage = {
  id: number;
  text: string;
  tone: ToastTone;
  action?: ToastAction;
  icon?: IconDefinition;
  topic?: string;
  durationMs?: number;
  /** Set on an Undo toast by the overlay service: the toast offers to take a change back, and goes when that change is no longer there to take back. */
  undo?: { entry?: number; /** How many more moves (a page or chapter change that dismisses Undo toasts) the toast outlives. */ survives?: number };
};
/** How a page or a component tells the narrator something. An error is announced at once and stays until it is dismissed or `TOAST_ERROR_MS` has passed.
 * `action` adds one button (for example Undo) before the dismiss button; pressing it runs the action and dismisses the toast.
 * `icon` leads an information message with the glyph of what it is about (the track glyph for a chapter sync); an error always
 * leads with its warning glyph. */
export type Notify = (text: string, tone?: ToastTone, action?: ToastAction, icon?: IconDefinition, durationMs?: number, topic?: string) => void;

/** How long an information message stays. */
export const TOAST_INFO_MS = 5_000;
/** How long an error stays: longer than an information message, so it can be read and its Retry reached, but not for ever. */
export const TOAST_ERROR_MS = 20_000;
/** The longest any toast stays, whatever `durationMs` asks for. */
export const TOAST_MAX_MS = 60_000;
/** How long an information message stays when its button is the only way to what it announces (the scan's Show them): longer than a keyboard user needs to Tab to it. */
export const TOAST_ACTION_MS = 12_000;
const FADE_MS = 150;
/** The time-left bar's look, one for the animated bar and the stepped one drawn under reduced motion so they cannot drift (#3667). */
const COUNTDOWN_BAR = 'pointer-events-none absolute right-0 bottom-0 h-[3px] origin-left bg-[color-mix(in_srgb,var(--toast-text)_55%,transparent)]';
/** How often the time-left bar steps under reduced motion (#3667): the one exception to the motion rule, a timer shown without moving. */
const TOAST_STEP_MS = 1000;
/** How long an action has to put focus where it wants (the Schedule's restored row, after its Undo resolves) before focus is handed back to where it was. */
// shortcut: a fixed wait, not the action's own promise (`onAction` returns nothing); upgrade when an action reports when it is done.
export const ACTION_FOCUS_MS = 250;

/** How long a message stays: its tone's time, or the `durationMs` it asked for when that is a positive number (an error is never shorter than its own default), and never more than `TOAST_MAX_MS`. Every toast has a timer, so none is made without a bounded lifetime. */
export function toastLifetimeMs(message: Pick<ToastMessage, 'tone' | 'durationMs'>): number {
  const asked = message.durationMs;
  const base = message.tone === 'error' ? TOAST_ERROR_MS : TOAST_INFO_MS;
  const own = typeof asked === 'number' && Number.isFinite(asked) && asked > 0 ? asked : base;
  // An error is never shorter than its default, whatever a caller asks: it stays longer than an information message.
  return Math.min(message.tone === 'error' ? Math.max(own, base) : own, TOAST_MAX_MS);
}

// The cue that the text has more above or below, in the toast's own colours, drawn only while the text scrolls (on text that fits it left two grey blocks in the scrollbar gutter).
// Builds new because (b): Disclosure's `scrollCue` is a mask on its panel driven by that panel's own `data-more-below` bookkeeping and fades the bottom only; reusing it here would turn Disclosure into a
// both-ends cue for text on an inverted surface, a new purpose for it.
const TEXT_SCROLL_CUE =
  '[background:linear-gradient(var(--toast-bg)_30%,transparent)_center_top/100%_1rem_no-repeat_local,linear-gradient(to_top,var(--toast-bg)_30%,transparent)_center_bottom/100%_1rem_no-repeat_local,linear-gradient(color-mix(in_srgb,var(--toast-text)_40%,transparent),transparent)_center_top/100%_0.5rem_no-repeat_scroll,linear-gradient(to_top,color-mix(in_srgb,var(--toast-text)_40%,transparent),transparent)_center_bottom/100%_0.5rem_no-repeat_scroll]';

/** A key's identity: its `code`, else its `key` (a synthetic event may have no code). */
const keyOf = (event: { code: string; key: string }): string => event.code || event.key;
/** Whether a key press activates a button: Enter (either one) and Space. A synthetic event may carry only its `key`. */
const activates = (event: { code: string; key: string }): boolean =>
  event.key === 'Enter' || event.key === ' ' || event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space';

/** A key that has repeated still counts as held, at a pointer press, when its last repeat was this recently, or within three of its own repeat gaps if that is longer (the slowest OS repeat settings, and Windows FilterKeys, repeat every one to two seconds). */
const KEY_LIVE_MS = 700;
/** One hand-back in progress: the keys it still waits for, what starts its timer once they are up, and whether focus has been taken meanwhile (then it will hand nothing, and holds no key). */
type HandBackWait = { codes: Set<string>; run: () => void; taken: () => boolean };

/**
 * What a press or a focused toast leaves waiting (a hand-back's timer and its wait for a key, the fallback for a toast removed with focus inside it, the document listeners that swallow a held key's repeats)
 * belongs to the region, not the module: it goes with the region (#4103).
 * A test's `cleanup()` unmounts the region but not a timer, and a timer left over moved focus in whatever ran next. A closed owner cancels what it is handed at once; React's development remount closes and reopens it
 * before anything is held.
 */
class HandBacks {
  private cancels = new Set<() => void>();
  private open = true;
  /** Each held key, with when it went down. */
  private held = new Map<string, number>();
  /** When each held key last repeated and how long it took (a key that has not yet has no entry): a pointer press lets go of one that repeated and then went silent, a lost keyup. */
  private heard = new Map<string, { at: number; gap: number }>();
  private waiting = new Set<HandBackWait>();
  private keysCancel: (() => void) | null = null;
  private pressKey: string | null = null;
  private graceTimer: number | undefined;
  /** Whether a keyboard dismissal is in progress or has just handed focus back: a fresh Enter or Space is consumed, so it presses neither what focus went to nor what the page does with the key (#4125). */
  private grace = false;
  hold(cancel: () => void): void {
    if (this.open) this.cancels.add(cancel);
    else cancel();
  }
  release(cancel: () => void): void {
    this.cancels.delete(cancel);
  }
  close(): void {
    this.open = false;
    window.clearTimeout(this.graceTimer);
    this.grace = false;
    this.waiting.clear();
    const all = [...this.cancels];
    this.cancels.clear();
    for (const cancel of all) cancel();
  }
  reopen(): void {
    this.open = true;
  }
  /**
   * A key went down on a toast's button. Its repeats, and only its, must press nothing (they would press the button again, or what the press hands focus to) until it comes up (#4063).
   */
  keyDown(code: string, activating = false): void {
    if (!this.open) return;
    this.held.set(code, performance.now());
    if (activating) this.pressKey = code;
    this.listen();
  }
  /** One set of document listeners for every key held at once and every hand-back in progress, ended when the last of them is over. */
  private listen(): void {
    if (this.keysCancel || !this.open) return;
    const swallow = (event: KeyboardEvent) => {
      const code = keyOf(event);
      // A fresh Enter or Space from the moment a keyboard dismissal begins until a moment after it has handed focus back is not a press: it would press the control focus goes to (the next row's Remove) or run the page's
      // own command (Space plays, Enter keeps a take). It is held, so its repeats are cancelled until its keyup, which (a button is clicked by Enter's keydown and by Space's keyup) a cancelled keydown never arms.
      // Not a chord (Ctrl+Enter is a dialog's own), not a composition, and not a Space typed into a field (the space in the text).
      if (
        this.grace &&
        !event.repeat &&
        activates(event) &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.isComposing &&
        !(event.code === 'Space' && takesTypedText(event.target))
      ) {
        // A code already held is a fresh press whose keyup was lost (the rule below): it is held again, with every hand-back that is not past it, which waits for the new press's keyup.
        this.held.set(code, performance.now());
        for (const wait of this.waiting) if (!wait.taken()) wait.codes.add(code);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const own = this.held.has(code);
      // A fresh press of a held code means its keyup was lost: it is let go, so its next repeats (an Enter held down in a field) are the field's own. A hand-back that was waiting for it is not let run under the new
      // press: the next rule holds the code again for every hand-back whose focus is not taken, and a hand-back's timer waits for the keys then held (`waitsForKeys`).
      if (own && !event.repeat) this.keyUp(code);
      // An Enter or a Space that goes down while a hand-back is in progress (on <body>, where the press left focus) would press the control focus is handed to, by its repeats and its keyup: the hand-back waits for it
      // too, and its repeats are cancelled. A hand-back whose focus has been taken (a field, a dialog: the key goes to what has focus) will hand nothing, so holds no key.
      const live = [...this.waiting].filter((wait) => !wait.taken());
      if (!event.repeat && live.length > 0 && activates(event)) {
        this.held.set(code, performance.now());
        for (const wait of live) wait.codes.add(code);
        return;
      }
      // Only the held key's repeats: another key's (a Backspace held in a field) are its own, even while a held key's keyup is lost.
      if (!own || !event.repeat) return;
      const now = performance.now();
      this.heard.set(code, { at: now, gap: now - (this.heard.get(code)?.at ?? this.held.get(code) ?? now) });
      event.preventDefault();
      event.stopPropagation();
    };
    const up = (event: KeyboardEvent) => this.keyUp(keyOf(event));
    // The window lost focus (alt-tab, a native dialog) or the page was hidden: the keyup may never come, so the waits end and focus is handed back, but the key stays held until its keyup or a fresh press of it, so its
    // repeats, once focus is back, still press nothing.
    const lost = () => this.endWaits();
    const hidden = () => {
      if (document.visibilityState === 'hidden') this.endWaits();
    };
    const cancel = () => {
      document.removeEventListener('keydown', swallow, true);
      document.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', lost);
      document.removeEventListener('visibilitychange', hidden);
      this.keysCancel = null;
    };
    document.addEventListener('keydown', swallow, true);
    document.addEventListener('keyup', up, true);
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', hidden);
    this.keysCancel = cancel;
    this.hold(cancel);
  }
  /**
   * The key a press that has just been made is waiting for: the one that last activated a toast's button, if it is still held. Forgotten when the waits end (a window that lost focus), so a click that comes much
   * later with no key (a screen reader's) does not wait for a keyup that has gone.
   */
  pressKeyHeld(): string | null {
    const key = this.pressKey;
    this.pressKey = null;
    return key !== null && this.held.has(key) ? key : null;
  }
  /**
   * A hand-back begins, from the press's key (`key`, if still held). `run` starts its timer, once, when the keys it waits for are up (at once when there are none); it is called again if a key goes down while that
   * timer runs and comes up (`waitsForKeys` says whether the timer's end must wait). The listeners stay while it is in progress, so a key that goes down during the timer is seen. `stop` ends it.
   */
  beginHandBack(key: string | null, run: () => void, taken: () => boolean): { stop: () => void; waitsForKeys: () => boolean } {
    const wait: HandBackWait = { codes: new Set(key === null ? [] : [key]), run, taken };
    this.waiting.add(wait);
    this.listen();
    if (wait.codes.size === 0) run();
    return {
      stop: () => {
        this.waiting.delete(wait);
        this.endKeysIfIdle();
      },
      waitsForKeys: () => wait.codes.size > 0,
    };
  }
  /**
   * A keyboard dismissal begins: a fresh Enter, NumpadEnter or Space is consumed (`listen`) until `endGrace`, so a double press does not press what focus goes to (#4125). Not for ever: a dismissing key whose keyup never
   * comes keeps the hand-back waiting, so the grace ends `KEY_LIVE_MS` after the dismissal at the latest (the time a key stays held with no repeat), and a fresh press is then the rule of a lost keyup.
   */
  startGrace(): void {
    if (!this.open) return;
    this.graceFor(KEY_LIVE_MS);
  }
  /** The dismissal has handed focus back (`handed`) or has nothing to hand: the grace runs `ACTION_FOCUS_MS` more, or ends now. */
  endGrace(handed: boolean): void {
    if (handed && this.open) this.graceFor(ACTION_FOCUS_MS);
    else this.graceOver();
  }
  private graceFor(ms: number): void {
    window.clearTimeout(this.graceTimer);
    this.grace = true;
    this.listen();
    this.graceTimer = window.setTimeout(() => this.graceOver(), ms);
  }
  private graceOver(): void {
    window.clearTimeout(this.graceTimer);
    this.grace = false;
    this.endKeysIfIdle();
  }
  /**
   * A press with the pointer on a toast: a held key that repeated and then went silent (its keyup was lost) is let go. One that is still repeating is held, and so is one that has not repeated yet (the first repeat
   * comes after the system's delay, up to about a second). Its keyup or a fresh press of it lets it go; the window losing focus or the page being hidden ends only the waits, and the region closing removes the
   * listeners but leaves the keys as they were.
   */
  endLost(): void {
    const now = performance.now();
    for (const [code, { at, gap }] of [...this.heard]) if (now - at > Math.max(KEY_LIVE_MS, 3 * gap)) this.keyUp(code);
  }
  private keyUp(code: string): void {
    this.held.delete(code);
    this.heard.delete(code);
    for (const wait of [...this.waiting]) {
      if (wait.codes.delete(code) && wait.codes.size === 0) wait.run();
    }
    this.endKeysIfIdle();
  }
  private endWaits(): void {
    this.pressKey = null;
    for (const wait of [...this.waiting]) {
      if (wait.codes.size === 0) continue;
      wait.codes.clear();
      wait.run();
    }
  }
  private endKeysIfIdle(): void {
    if (this.held.size > 0 || this.waiting.size > 0 || this.grace) return;
    const cancel = this.keysCancel;
    if (!cancel) return;
    this.release(cancel);
    cancel();
  }
}

/** Whether focus has moved since now, to anywhere (a dialog or menu that opened, a field): then it is theirs, and a hand-back leaves it. */
function watchFocusTaken(): { taken: () => boolean; stop: () => void } {
  let taken = false;
  const watch = () => {
    taken = true;
  };
  document.addEventListener('focusin', watch, true);
  return { taken: () => taken, stop: () => document.removeEventListener('focusin', watch, true) };
}

/**
 * Where focus goes when a toast hands it on: the control that had it before the toast took it, else the Dismiss of the toast now in the slot, else the page's <main> (the app's `#main-content`, the project picker's
 * too), the first of them that takes focus. A dialog that is open keeps what lies behind it: only a target inside it or among the toasts counts, so with an origin that is gone, `<main>` is left alone. When none takes focus,
 * nothing is handed on and focus stays where it is, possibly <body>. Both ways a toast hands focus on, a press (`settle`) and a removal with focus inside it (the fallback), look here.
 */
function handBackTargets(origin: HTMLElement | null): HTMLElement[] {
  const layer = openModalLayer();
  const found = [origin, document.querySelector<HTMLElement>('[data-toast-region] [aria-label="Dismiss message"]'), document.getElementById('main-content')];
  return found.filter((el): el is HTMLElement => el !== null && el.isConnected && (!layer || layer.contains(el) || el.closest('[data-toast-region]') !== null));
}

/** Focuses the first candidate that takes it (a disabled or hidden one does not); false when none did. */
function focusFirst(candidates: HTMLElement[]): boolean {
  for (const candidate of candidates) {
    candidate.focus();
    if (document.activeElement === candidate) return true;
  }
  return false;
}

function ToastItem({ message, dismiss, owner, more = 0 }: { message: ToastMessage; dismiss: (id: number) => void; owner: HandBacks; more?: number }) {
  // A message of more than two lines is read by scrolling its text, which then needs the keyboard too: the text takes focus only while it overflows (#2793).
  const text = useRef<HTMLSpanElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = text.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Measured with the scrollbar's gutter out of the way: a box that scrolls loses the gutter's width to it, so its text wraps to one more line than it would without, and a box measured while it scrolls
    // stays overflowing after the font it was first laid out in (a fallback, wider) has loaded (#4112). The gutter (`styles.css` keeps one on every auto-scrolling box, and it outlives `overflow: hidden`) is what
    // matters; the overflow is switched off with it as a precaution (a browser that draws the gutter only for a scrolling box), and both are put back, even if the read throws.
    const measure = () => {
      const { overflowY, scrollbarGutter } = el.style;
      // Toggling the gutter widens the box, which can clamp the scroll position: the narrator's place in the text is put back.
      const top = el.scrollTop;
      let overflows: boolean;
      try {
        el.style.overflowY = 'hidden';
        el.style.scrollbarGutter = 'auto';
        overflows = el.scrollHeight > el.clientHeight + 1;
      } finally {
        el.style.overflowY = overflowY;
        el.style.scrollbarGutter = scrollbarGutter;
        if (top !== 0) el.scrollTop = top;
      }
      // The text is a Tab stop only while it scrolls: if it had focus when it stops, focus goes to the toast's Dismiss, never to its action (the text owned the keys that page it, so the next Space the narrator
      // presses would run an action they never chose), and never to <body> (focus is never left on <body>).
      if (!overflows && document.activeElement === el)
        el.closest<HTMLElement>('[data-tone]')?.querySelector<HTMLElement>('[aria-label="Dismiss message"]')?.focus();
      setScrolls(overflows);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    // A toast raised before the web font arrives is laid out in the fallback font; the text is measured again when the fonts have loaded.
    const fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', measure);
    let live = true;
    // A rejected `ready` (it does not reject in a browser) leaves the listener and the observer to do the work.
    fonts?.ready?.then(
      () => live && measure(),
      () => undefined,
    );
    return () => {
      live = false;
      fonts?.removeEventListener?.('loadingdone', measure);
      watch.disconnect();
    };
  }, [message.text]);
  const [leaving, setLeaving] = useState(false);
  const isError = message.tone === 'error';
  const { id } = message;
  const stays = toastLifetimeMs(message);
  // A pointer resting on the toast or focus inside it holds the timer; leaving starts the full time again, so a message is never taken from under a hand or a key.
  const hover = useRef(false);
  const focused = useRef(false);
  const [held, setHeld] = useState(false);
  const hold = () => setHeld(hover.current || focused.current);
  // The second click of a double click (`detail` 2) is not a press: when the first click dismissed this toast's neighbour, the next toast took its place under the pointer and would take the second click (#4063).
  const tooSoon = (event: { detail: number }) => event.detail >= 2;
  // A key held down repeats, and the repeats must not press the button again, nor press what focus is handed to (#4063). The owner knows which keys are held, and which one last activated a toast's button (Enter or
  // Space): the hand-back after a press waits for that one to come up. Another key pressed on the button meanwhile (a Shift) is held and has its repeats cancelled, but is not what the press waits for.
  const onButtonKey = (event: { repeat: boolean; code: string; key: string; preventDefault: () => void }) => {
    if (event.repeat) event.preventDefault();
    else {
      owner.keyDown(keyOf(event), activates(event));
    }
  };
  // A toast under a pointer that is not moving is not hovered, however it came there (it appeared under the button that raised it, another toast above it went, it came back after a
  // dialog): the browser says the pointer entered, but the narrator did not reach for it, and holding it would keep it up for ever. Only a pointer that moves over the toast holds it (#4063).
  const pointerOn = () => {
    hover.current = true;
    hold();
  };
  // The time gone, in whole seconds, for the stepped bar drawn under reduced motion (below): it starts again from nothing whenever the hold changes, as the timers do.
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    setElapsedMs(0);
    if (held) return;
    const from = Date.now();
    const tick = window.setInterval(() => setElapsedMs(Math.min(stays, Math.floor((Date.now() - from) / TOAST_STEP_MS) * TOAST_STEP_MS)), TOAST_STEP_MS);
    return () => window.clearInterval(tick);
  }, [held, stays]);
  // The control that had focus before the toast took it: where focus goes back once the toast is gone and no other toast is to take it.
  const origin = useRef<HTMLElement | null>(null);
  // A press (a click or a key on the toast's own buttons) hands focus on by itself (`settle`); a toast that goes any other way with focus inside it (the same message raised again, replacing it) hands it on here the same way (`handBackTargets`), so focus does not fall to <body> unless a dialog keeps everything else behind it.
  const pressed = useRef(false);
  // Which of the toast's own buttons has focus (its action's label, or 'Dismiss message'): the toast that replaces this one in place has the same control, and focus stays on that.
  const focusedButton = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (pressed.current || !focused.current) return;
      const name = focusedButton.current;
      const timer = window.setTimeout(() => {
        owner.release(cancel);
        const active = document.activeElement;
        if (active && active !== document.body) return;
        const same =
          name === null
            ? null
            : [...document.querySelectorAll<HTMLElement>('[data-toast-region] [data-tone] button')].find(
                (b) => (b.getAttribute('aria-label') ?? b.textContent) === name,
              );
        if (same) same.focus();
        else focusFirst(handBackTargets(origin.current));
      }, 0);
      const cancel = () => window.clearTimeout(timer);
      owner.hold(cancel);
    },
    [owner],
  );
  // `act` is the press's action, run once the watch for focus moving is up, so focus the action moves itself is seen by it.
  const settle = (always: boolean, act?: () => void) => {
    pressed.current = true;
    // Focus that something took since the press (a dialog or menu opened, a field was reached, even if it has closed since) is theirs: nothing is handed back (#4103).
    const focus = watchFocusTaken();
    try {
      act?.();
    } catch (error) {
      // An action that throws leaves no watch behind (the toast stays, as when it threw before the watch existed).
      focus.stop();
      throw error;
    }
    dismiss(id);
    // A dismissal's focus is handed at once, so an Enter or Space pressed again meanwhile would press what has it: they are consumed from now until a moment after (`HandBacks.startGrace`).
    if (always) owner.startGrace();
    let timer: number | undefined;
    const cancel = () => {
      window.clearTimeout(timer);
      wait.stop();
      focus.stop();
      owner.release(cancel);
    };
    // Only focus that is on nothing is handed back: an action that opened a dialog or moved focus keeps what it did.
    const hand = () => {
      // A key that went down while the timer ran is waited for as the press's own key was: its keyup starts the timer again.
      if (wait.waitsForKeys()) return;
      const active = document.activeElement;
      const taken = focus.taken();
      cancel();
      if (taken) {
        if (always) owner.endGrace(false);
        return;
      }
      // Looked up when it is handed over: the Dismiss of the toast that has taken the slot by then, <main> once the origin is gone, none of them behind an open dialog.
      const handed = (always || !active || active === document.body || !active.isConnected) && focusFirst(handBackTargets(origin.current));
      if (always) owner.endGrace(handed);
    };
    const start = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(hand, always ? 0 : ACTION_FOCUS_MS);
    };
    // The key that pressed, still held down, would repeat on whatever gets focus: wait for that key (not another) to come up. The wait ends too when the window loses focus or the page is hidden (`HandBacks`),
    // where its keyup may never come.
    const wait = owner.beginHandBack(owner.pressKeyHeld(), start, () => focus.taken());
    owner.hold(cancel);
  };
  useEffect(() => {
    // A hold that starts in the fade brings the toast back: it was not taken away, and it gets its full time again on release.
    if (held) {
      setLeaving(false);
      return;
    }
    const fade = window.setTimeout(() => setLeaving(true), stays - FADE_MS);
    const remove = window.setTimeout(() => dismiss(id), stays);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, [dismiss, id, stays, held]);
  return (
    <div
      data-tone={message.tone}
      onPointerMove={pointerOn}
      // A press with the pointer gives up on a held key whose keyup never came: its repeats are let through and any hand-back waiting for it goes ahead.
      onPointerDown={() => owner.endLost()}
      onPointerLeave={() => ((hover.current = false), hold())}
      onFocus={(event) => {
        focused.current = true;
        hold();
        const button = (event.target as HTMLElement).closest('button');
        focusedButton.current = button ? (button.getAttribute('aria-label') ?? button.textContent) : null;
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && !event.currentTarget.contains(from)) origin.current = from;
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        focused.current = false;
        hold();
      }}
      // Inverted in both themes (src/studio/ui/src/styles.css's --toast-bg/--toast-text), 56 px tall (room for two lines of text) with a leading glyph, radius 6
      // (daw-chapter-track-auto-sync/03). An error's 4 px --danger edge is a strip inside the clipped box, not a border, so it runs straight
      // down the left and the box's corners clip it, rather than a border bending round the radius (alignment audit R3PF-4).
      className={`relative flex h-[3.5rem] max-w-full items-center gap-[0.625rem] overflow-hidden rounded-[var(--radius-button)] bg-[var(--toast-bg)] py-1.5 pr-1.5 pl-4 text-[0.85rem] text-[var(--toast-text)] shadow-[var(--shadow)] motion-ok:animate-[toast-in_var(--motion-fast)_var(--ease-enter)] motion-ok:transition-[opacity,transform] motion-ok:duration-(--motion-fast) motion-ok:ease-(--ease-exit) ${leaving ? 'translate-y-1 opacity-0' : 'opacity-100'}`}
    >
      {isError && <span data-toast-edge aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[var(--danger)]" />}
      {/* The time left (#3667): a 3 px bar along the bottom edge inside the clipped box, so it takes no room and sits under no button (the buttons end 6 px above it). It shrinks over the
          same `stays` the timers above wait, from `held` the same way: a hold shows it whole and still, and leaving starts it again from the full width, as the timer starts again.
          Under reduced motion the animated bar is not drawn and a stepped one is: the same bar, redrawn once a second with no animation (`motion-still:`), so the owner and a narrator who asked
          for less motion still see the time go (the one exception to the motion rule, docs/design/motion-and-animation.md). An error's edge strip keeps its whole height. */}
      <span
        data-toast-countdown
        aria-hidden="true"
        style={held ? undefined : { animationDuration: `${stays}ms` }}
        className={`${COUNTDOWN_BAR} ${isError ? 'left-1' : 'left-0'} motion-still:hidden ${held ? '' : 'motion-ok:animate-[toast-countdown_linear_forwards]'}`}
      />
      <span
        data-toast-countdown-stepped
        aria-hidden="true"
        style={{ transform: `scaleX(${1 - elapsedMs / stays})` }}
        className={`${COUNTDOWN_BAR} ${isError ? 'left-1' : 'left-0'} hidden motion-still:block`}
      />
      {isError ? (
        <FontAwesomeIcon icon={faCircleExclamation} aria-hidden="true" />
      ) : (
        message.icon && <FontAwesomeIcon icon={message.icon} aria-hidden="true" className="flex-none" />
      )}
      {/* At most two lines (#4063, #2793): a long message (one word of 10,000 letters, a pasted error) wraps anywhere and scrolls inside the toast, which is a fixed height, so the slot the shell
          keeps for it (`--toast-slot`) never changes size and showing one moves nothing. The text takes focus only while it scrolls, so the keyboard reaches all of it; a screen reader reads all of it from the live region. */}
      <span
        ref={text}
        data-toast-text
        // The app's own sentences are English: `dir="auto"` took the direction of the first strong character, so a sentence that began with a right-to-left chapter or track name ("<Arabic> is linked
        // to its track. Press Record…") turned the whole line around and sent the full stop to the start (#4113). `textDirection` reads it left to right when the app's own words outnumber (or equal)
        // the right-to-left ones, outside the names the builders isolate, and leaves `auto` to a message that is mostly right to left (#2957).
        dir={textDirection(message.text)}
        tabIndex={scrolls ? 0 : undefined}
        // The attribute is always set: the text keeps the keys that scroll it, so the page's shortcuts (Space starts a recording in the Booth) never fire from it (src/input/targets.ts). Only while the
        // text overflows is it a scroller (which Chromium makes a tab stop): a message that fits, even by a sub-pixel, is plain text and no tab stop.
        data-owns-keys=""
        className={`max-h-[2.5em] min-w-0 leading-tight [overflow-wrap:anywhere] ${scrolls ? `overflow-y-auto ${TEXT_SCROLL_CUE}` : 'overflow-hidden'}`}
      >
        {message.text}
      </span>
      {more > 0 && (
        // The neutral status badge as a tag, named for a screen reader (the pill alone reads "plus 2"); the hint is for the pointer.
        <TooltipTarget text={`${plural(more, 'more message')} waiting`}>
          <span data-toast-more role="img" aria-label={`${plural(more, 'more message')} waiting`} className="flex-none">
            <StatusBadge tone="neutral" shape="tag" label={`+${formatCount(more)}`} />
          </span>
        </TooltipTarget>
      )}
      {message.action && (
        <button
          title={message.action.label}
          className={`min-h-6 max-w-[40%] min-w-6 flex-none truncate py-0.5 text-left font-semibold underline underline-offset-2 ${HIT_AREA}`}
          onKeyDown={onButtonKey}
          onClick={(event) => {
            if (tooSoon(event)) return;
            pressed.current = true;
            const button = event.currentTarget;
            // Focus is handed back only when a key pressed the button (`detail` 0): a mouse press hands it nowhere, so focus the app moved is never a hold on a toast the narrator did not reach for (#4063).
            const had = event.detail === 0 && button.contains(document.activeElement);
            if (had) settle(false, () => message.action!.onAction());
            else {
              message.action!.onAction();
              dismiss(id);
            }
          }}
        >
          {message.action.label}
        </button>
      )}
      {/* A 32 px square, the small IconButton's size, where the bare glyph was a 17 x 20 target (XBO-13, R3SE2-4, R3PF-4). */}
      <button
        aria-label="Dismiss message"
        className="inline-flex size-[var(--button-height-sm)] flex-none items-center justify-center rounded-[var(--radius-button)] hover:opacity-75"
        onKeyDown={onButtonKey}
        onClick={(event) => {
          if (tooSoon(event)) return;
          pressed.current = true;
          // Dismissing the button that has focus must not drop focus on the page: it goes back to where it was before the toast, else to the toast that takes the slot, else to <main>.
          if (event.detail === 0 && document.activeElement === event.currentTarget) settle(true);
          else dismiss(id);
        }}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}

// The region keeps the page gutter from the window's right and bottom edges, where the top bar's and the footer's content end (alignment audit XBO-13).
// While a modal dialog is open the toasts stay in the window's bottom-right corner, at the gutter: a dialog hangs from the top and stops at
// least 4.75rem above the bottom edge (`Dialog`, above 400 px of height; at 400 px and below it takes what is left above the toast, `--toast-h`), so a toast there is clear of its action row when it is no taller than that room (alignment audit cause P; over a dialog the newest toast shows alone, one 45 px line, so it is never taller than that room, #3605), and the bars a toast
// otherwise rises above are behind the scrim. At the top of the window a toast covered the top bar's buttons, the Booth's included (R4BO2-4).
// A dialog says it is open with `useToastsClearOfModal`; the count keeps two stacked dialogs from clearing it early.
const MODAL_OPEN_ATTRIBUTE = 'data-modal-open';
let openModals = 0;
export function useToastsClearOfModal(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    openModals += 1;
    document.documentElement.setAttribute(MODAL_OPEN_ATTRIBUTE, '');
    return () => {
      openModals -= 1;
      if (openModals === 0) document.documentElement.removeAttribute(MODAL_OPEN_ATTRIBUTE);
    };
  }, [active]);
}

/** Brings the focused control of the topmost dialog into view inside the popup's own scrolling areas (the body and any area in it), innermost first. The popup itself is never scrolled: it clips, and the header and action row stay put. */
function keepFocusInDialog(): void {
  // Only where the rule applies: in a taller window the room does not change with the toast, and a resize must not move a narrator's place in a long dialog.
  if (window.innerHeight > 400) return;
  const popup = openModalLayer();
  const focused = document.activeElement;
  if (!popup || !(focused instanceof HTMLElement) || focused === popup || !popup.contains(focused)) return;
  for (let scroller = focused.parentElement; scroller && scroller !== popup; scroller = scroller.parentElement) {
    if (!/auto|scroll/.test(getComputedStyle(scroller).overflowY)) continue;
    const inner = scroller.getBoundingClientRect();
    const at = focused.getBoundingClientRect();
    if (at.top < inner.top) scroller.scrollTop -= inner.top - at.top;
    else if (at.bottom > inner.bottom) scroller.scrollTop += at.bottom - inner.bottom;
  }
}

/** Where the toasts stand above the window's bottom edge, in px, and the slot the shell keeps for one toast there (`--toast-bottom`, `--toast-slot`). */
const TOAST_SLOT_PROPERTY = '--toast-slot';
const TOAST_BOTTOM_PROPERTY = '--toast-bottom';
/** A toast's height (`h-[3.5rem]`: two lines of text) and the air above it, in rem; the gap under it is the page gutter, or half of it in a window 400 px tall or less, where a permanent slot costs more of what is left. */
const TOAST_HEIGHT_REM = 3.5;
const TOAST_AIR_REM = 0.5;
/** A window this tall or shorter keeps no slot: the toast floats at the edge. Far below the product's 960 px minimum window, where the Booth's panels need the room (`tiny-window-overflow.spec.ts`, 300 to 520 px). */
const SHORT_WINDOW_PX = 520;

/**
 * Keeps a slot for one toast, always, so showing one moves nothing (#4063, owner decision): the shell ends the page above it (`AppShell`), and a toast stands in it at the gutter, covering no
 * button and shifting no layout (`error-shift.spec.ts`). The slot is one toast high and never grows: the region shows one toast, and the others wait their turn, so a second message moves nothing. Set on the root in px, because the clearance
 * of what is fixed over the window's bottom edge reads it as a number (`useToastClearance`). Removed with the region.
 */
function useToastSlot(): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const set = () => {
      const rem = Number.parseFloat(getComputedStyle(root).fontSize) || 16;
      // The page gutter is 1rem (`--page-gutter`, styles.css).
      const gutter = rem;
      const short = window.innerHeight <= SHORT_WINDOW_PX;
      const bottom = gutter;
      root.style.setProperty(TOAST_BOTTOM_PROPERTY, `${bottom}px`);
      // In a window this short a permanent slot would take what the Booth's panels and the reading need (`tiny-window-overflow.spec.ts`): there the toast floats at the edge, as it did before.
      root.style.setProperty(TOAST_SLOT_PROPERTY, short ? '0px' : `${Math.ceil(bottom + (TOAST_HEIGHT_REM + TOAST_AIR_REM) * rem)}px`);
      window.dispatchEvent(new Event(TOAST_ROOM_EVENT));
    };
    set();
    window.addEventListener('resize', set);
    return () => {
      window.removeEventListener('resize', set);
      root.style.removeProperty(TOAST_BOTTOM_PROPERTY);
      root.style.removeProperty(TOAST_SLOT_PROPERTY);
      window.dispatchEvent(new Event(TOAST_ROOM_EVENT));
    };
  }, []);
}

/** The custom property the toasts publish while they show: how much of the window's bottom they take (their height, the gap under them and 0.5rem of air), in px. */
export const TOAST_HEIGHT_PROPERTY = '--toast-h';
/** The most of the window the page gives up to the toasts, as a share of its height: a stack in a very short window may lie over the page by design, because every toast and button must stay inside the window. */
const STRIP_MAX_SHARE = 0.6;

/**
 * While a toast shows, publishes `--toast-h` on the root: the room from the window's bottom edge up to the toasts' top.
 * Over an open modal dialog, `Dialog` reads it in a window 400 px tall or less and takes what is left above the toasts, so a toast does not sit on its content or its focused
 * control (#3605, #3601; `DIALOG_TOAST_ROOM`). With no dialog open, the shell reads it (`AppShell`) and ends the page above the toasts, so a toast stands in a strip of its own
 * and covers no button, whatever the page, its bars or its scrolling columns are (#4063): the strip is held to `STRIP_MAX_SHARE` of the window. With no toast the property is not set,
 * so nothing moves. It follows the region's height, a resize of the window and a dialog opening or closing.
 */
function useToastHeightPublished(region: { current: HTMLElement | null }, showing: boolean): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const box = region.current;
    if (!showing || !box) return;
    const publish = () => {
      // From the first toast drawn: the region's own top may hold an empty live region above it.
      const first = box.querySelector('[data-tone]:not([hidden])') ?? box;
      const rem = Number.parseFloat(getComputedStyle(root).fontSize) || 16;
      const room = Math.ceil(window.innerHeight - first.getBoundingClientRect().top + TOAST_AIR_REM * rem);
      const modal = root.hasAttribute(MODAL_OPEN_ATTRIBUTE);
      // A short window keeps no strip (see `useToastSlot`), over a dialog or not the room is what a dialog reads. One toast is showing at most, so the strip is the slot's own height.
      const strip = window.innerHeight <= SHORT_WINDOW_PX ? 0 : Math.min(room, Math.floor(window.innerHeight * STRIP_MAX_SHARE));
      root.style.setProperty(TOAST_HEIGHT_PROPERTY, `${modal ? room : strip}px`);
      // The dialog's room just changed: the field being typed in must not be left half under the popup's new edge.
      if (modal) window.requestAnimationFrame(keepFocusInDialog);
      // The page moves with the strip: what is fixed over the window's edge (`useToastClearance`) reads where the bars stand now.
      window.requestAnimationFrame(() => window.dispatchEvent(new Event(TOAST_ROOM_EVENT)));
    };
    publish();
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(publish);
    resize?.observe(box);
    const modal = new MutationObserver(publish);
    modal.observe(root, { attributes: true, attributeFilter: [MODAL_OPEN_ATTRIBUTE] });
    window.addEventListener('resize', publish);
    return () => {
      resize?.disconnect();
      modal.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty(TOAST_HEIGHT_PROPERTY);
      window.dispatchEvent(new Event(TOAST_ROOM_EVENT));
    };
  }, [region, showing]);
}

const TABBABLE =
  'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
// shortcut: radio groups count as one stop per radio, so a wrap may land on a radio the browser would skip; upgrade when a dialog's last control is a radio group.
const tabbables = (root: ParentNode): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => !el.closest('[hidden], [inert]'));

/**
 * Tab inside a modal that lets toasts show (see `useToastsClearOfModal`) goes on from the dialog's last control to the toasts' controls and
 * from the last of those back to the dialog's first, and Shift+Tab the reverse, so a toast's Retry is reachable without a pointer (#2949).
 * A dialog calls it from its popup's keydown; the toast region calls it from its own. Without toasts the trap is the library's, unchanged.
 */
export function routeTabAcrossToasts(event: { key: string; shiftKey: boolean; preventDefault: () => void }, popup: HTMLElement | null): void {
  if (event.key !== 'Tab' || !popup || !document.documentElement.hasAttribute(MODAL_OPEN_ATTRIBUTE)) return;
  const region = document.querySelector('[data-toast-region]');
  const toasts = region ? tabbables(region) : [];
  if (toasts.length === 0) return;
  const inside = tabbables(popup);
  const active = document.activeElement;
  const go = (el: HTMLElement | undefined) => {
    if (!el) return;
    event.preventDefault();
    el.focus();
  };
  if (region?.contains(active)) {
    if (!event.shiftKey && active === toasts[toasts.length - 1]) go(inside[0]);
    else if (event.shiftKey && active === toasts[0]) go(inside[inside.length - 1]);
  } else if (!event.shiftKey && (inside.length === 0 || active === inside[inside.length - 1])) go(toasts[0]);
  else if (event.shiftKey && (inside.length === 0 || active === inside[0] || active === popup)) go(toasts[toasts.length - 1]);
}

// The messages the app shows, in the order they were raised; the first shows. Neither region is atomic: a new message is read on its own, not every message again. Two live regions that are always mounted, so a screen reader hears a message that arrives
// later: errors interrupt (alert), everything else waits its turn (status). Base UI hides everything outside an open dialog from
// assistive technology except live regions carrying `aria-live`, and an error raised from inside a dialog is announced here.
export function ToastRegion({ messages: queued, dismiss }: { messages: readonly ToastMessage[]; dismiss: (id: number) => void }) {
  const region = useRef<HTMLDivElement>(null);
  const [owner] = useState(() => new HandBacks());
  useEffect(() => {
    owner.reopen();
    return () => owner.close();
  }, [owner]);
  // One toast shows, in a slot that never changes size (#4063), and nothing is drawn over a button. They show in the order they were raised, one after another: the first in the queue shows and the rest wait
  // behind it, counted in the toast (`+N`). A waiting toast is not mounted, so its time starts when it shows and every toast is on screen for its whole time; a waiting message is read out at once
  // (`data-toast-announce`). Over a dialog the same one toast shows, a box that fits the 4.75rem every dialog leaves under it (#3605).
  const shown = queued[0];
  const messages = shown ? [shown] : [];
  const announce = (message: ToastMessage) => (
    <span key={`announce-${message.id}`} data-toast-announce className="sr-only">
      {message.text}
    </span>
  );
  const showing = messages.length > 0;
  useToastSlot();
  useToastHeightPublished(region, showing);
  // Portalled to <body>: #root is an isolated stacking context (index.html), so a region inside it never beats the dialogs and slide-overs
  // the primitives portal to <body>, and a toast raised from one was drawn underneath it.
  return createPortal(
    <div
      ref={region}
      data-toast-region
      onKeyDown={(event) => routeTabAcrossToasts(event, openModalLayer())}
      // While a modal is open, a press on a toast's plain text would take focus from the dialog's control to <body> (the toast is outside the dialog); a press on
      // the toast's own button or link is the browser's.
      onMouseDown={(event) => {
        if (document.documentElement.hasAttribute(MODAL_OPEN_ATTRIBUTE) && !(event.target as Element).closest('button, a, input, select, textarea, [tabindex]'))
          event.preventDefault();
      }}
      className="fixed right-[calc(var(--page-gutter)+var(--toast-clear-right,0px))] bottom-[var(--toast-bottom,var(--page-gutter))] z-[var(--z-toast)] flex max-w-[min(28rem,calc(100vw-2*var(--page-gutter)-var(--toast-clear-right,0px)))] flex-col items-end [&>div:not(:empty)+div:not(:empty)]:mt-2 [:root[data-modal-open]_&]:right-[var(--page-gutter)] [:root[data-modal-open]_&]:bottom-[var(--page-gutter)] [@media(max-height:520px)]:bottom-[calc(var(--page-gutter)+min(var(--toast-clear,0px),calc(100dvh-2*var(--page-gutter)-8rem)))]"
    >
      <div role="alert" aria-live="assertive" aria-atomic="false" aria-relevant="additions" className="flex max-w-full flex-col items-end gap-2">
        {queued
          .slice(1)
          .filter((message) => message.tone === 'error')
          .map(announce)}
        {messages
          .filter((message) => message.tone === 'error')
          .map((message) => (
            <ToastItem key={message.id} message={message} dismiss={dismiss} owner={owner} more={queued.length - 1} />
          ))}
      </div>
      <div role="status" aria-live="polite" aria-atomic="false" aria-relevant="additions" className="flex max-w-full flex-col items-end gap-2">
        {queued
          .slice(1)
          .filter((message) => message.tone === 'info')
          .map(announce)}
        {messages
          .filter((message) => message.tone === 'info')
          .map((message) => (
            <ToastItem key={message.id} message={message} dismiss={dismiss} owner={owner} more={queued.length - 1} />
          ))}
      </div>
    </div>,
    document.body,
  );
}
