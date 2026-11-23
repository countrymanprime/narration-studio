import { TOAST_ROOM_EVENT } from '../../hooks/useToastClearance';
import { HIT_AREA } from './hitArea';
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

function ToastItem({ message, dismiss, waiting = false }: { message: ToastMessage; dismiss: (id: number) => void; waiting?: boolean }) {
  const [leaving, setLeaving] = useState(false);
  const isError = message.tone === 'error';
  const { id } = message;
  const stays = toastLifetimeMs(message);
  // A pointer resting on the toast or focus inside it holds the timer; leaving starts the full time again, so a message is never taken from under a hand or a key.
  const hover = useRef(false);
  const focused = useRef(false);
  const [held, setHeld] = useState(false);
  const hold = () => setHeld(hover.current || focused.current);
  // A toast under a pointer that is not moving is not hovered, however it came there (it appeared under the button that raised it, another toast above it went, it came back after a
  // dialog): the browser says the pointer entered, but the narrator did not reach for it, and holding it would keep it up for ever. Only a pointer that moves over the toast holds it (#4063).
  const pointerOn = () => {
    hover.current = true;
    hold();
  };
  // A toast that goes behind a newer one over a dialog (`waiting`) is not drawn, so the pointer or focus that held it has left without saying so: its time runs on.
  useEffect(() => {
    if (!waiting) return;
    hover.current = false;
    focused.current = false;
    setHeld(false);
  }, [waiting]);
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
  const settle = (from: HTMLElement, always: boolean) => {
    const all = [...document.querySelectorAll<HTMLElement>('[data-toast-region] [aria-label="Dismiss message"]')];
    const own = from.closest('[data-tone]')?.querySelector<HTMLElement>('[aria-label="Dismiss message"]');
    const at = own ? all.indexOf(own) : -1;
    const target = all[at + 1] ?? all[at - 1] ?? origin.current;
    dismiss(id);
    // Only focus that is on nothing is handed back: an action that opened a dialog or moved focus keeps what it did.
    window.setTimeout(
      () => {
        const active = document.activeElement;
        if (target?.isConnected && (always || !active || active === document.body || !active.isConnected)) target.focus();
      },
      always ? 0 : ACTION_FOCUS_MS,
    );
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
      hidden={waiting}
      onPointerMove={pointerOn}
      onPointerLeave={() => ((hover.current = false), hold())}
      onFocus={(event) => {
        focused.current = true;
        hold();
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && !event.currentTarget.contains(from)) origin.current = from;
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        focused.current = false;
        hold();
      }}
      // Inverted in both themes (src/studio/ui/src/styles.css's --toast-bg/--toast-text), 45 px tall with a leading glyph, radius 6
      // (daw-chapter-track-auto-sync/03). An error's 4 px --danger edge is a strip inside the clipped box, not a border, so it runs straight
      // down the left and the box's corners clip it, rather than a border bending round the radius (alignment audit R3PF-4).
      className={`relative ${waiting ? 'hidden' : 'flex'} h-[2.8125rem] max-w-full items-center gap-[0.625rem] overflow-hidden rounded-[var(--radius-button)] bg-[var(--toast-bg)] py-1.5 pr-1.5 pl-4 text-[0.85rem] text-[var(--toast-text)] shadow-[var(--shadow)] motion-ok:animate-[toast-in_var(--motion-fast)_var(--ease-enter)] motion-ok:transition-[opacity,transform] motion-ok:duration-(--motion-fast) motion-ok:ease-(--ease-exit) ${leaving ? 'translate-y-1 opacity-0' : 'opacity-100'}`}
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
      {/* One line, always: a long message (one word of 10,000 letters, a pasted error) is cut with an ellipsis and carries its whole text as its title; the text stays in the live region, so a screen
          reader reads all of it. The toast is a fixed 45 px high, so the slot the shell keeps for it (`--toast-slot`) never changes size and showing one moves nothing (#4063). */}
      <span data-toast-text dir="auto" title={message.text} className="min-w-0 truncate">
        {message.text}
      </span>
      {message.action && (
        <button
          title={message.action.label}
          className={`min-h-6 max-w-[40%] min-w-6 flex-none truncate py-0.5 text-left font-semibold underline underline-offset-2 ${HIT_AREA}`}
          onClick={(event) => {
            const button = event.currentTarget;
            const had = button.contains(document.activeElement);
            message.action!.onAction();
            if (had) settle(button, false);
            else dismiss(id);
          }}
        >
          {message.action.label}
        </button>
      )}
      {/* A 32 px square, the small IconButton's size, where the bare glyph was a 17 x 20 target (XBO-13, R3SE2-4, R3PF-4). */}
      <button
        aria-label="Dismiss message"
        className="inline-flex size-[var(--button-height-sm)] flex-none items-center justify-center rounded-[var(--radius-button)] hover:opacity-75"
        onClick={(event) => {
          // Dismissing the button that has focus must not drop focus on the page: it moves to the next toast's Dismiss, else the one before, else where it was before the toast.
          if (document.activeElement === event.currentTarget) settle(event.currentTarget, true);
          else dismiss(id);
        }}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}

/** Whether a modal dialog is open: `useToastsClearOfModal` sets the root's attribute while one is. */
function useModalOpen(): boolean {
  const [open, setOpen] = useState(() => typeof document !== 'undefined' && document.documentElement.hasAttribute(MODAL_OPEN_ATTRIBUTE));
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setOpen(root.hasAttribute(MODAL_OPEN_ATTRIBUTE));
    update();
    const watch = new MutationObserver(update);
    watch.observe(root, { attributes: true, attributeFilter: [MODAL_OPEN_ATTRIBUTE] });
    return () => watch.disconnect();
  }, []);
  return open;
}

// The region keeps the page gutter from the window's right and bottom edges, where the top bar's and the footer's content end (alignment audit XBO-13).
// While a modal dialog is open the toasts stay in the window's bottom-right corner, at the gutter: a dialog hangs from the top and stops at
// least 4.75rem above the bottom edge (`Dialog`, above 400 px of height; at 400 px and below it takes what is left above the toast, `--toast-h`), so a toast there is clear of its action row when it is no taller than that room (alignment audit cause P; over a dialog the newest toast shows alone with its text held to two lines, so it is never taller than that room, #3605), and the bars a toast
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
  const popup = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].pop();
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
export const TOAST_SLOT_PROPERTY = '--toast-slot';
const TOAST_BOTTOM_PROPERTY = '--toast-bottom';
/** A toast's height (`h-[2.8125rem]`) and the air above it, in rem; the gap under it is the page gutter, or half of it in a window 400 px tall or less, where a permanent slot costs more of what is left. */
const TOAST_HEIGHT_REM = 2.8125;
const TOAST_AIR_REM = 0.5;

/**
 * Keeps a slot for one toast, always, so showing one moves nothing (#4063, owner decision): the shell ends the page above it (`AppShell`), and a toast stands in it at the gutter, covering no
 * button and shifting no layout (`error-shift.spec.ts`). The slot is one toast high, so a second toast, or a taller stack, takes more (`--toast-h`). Set on the root in px, because the clearance
 * of what is fixed over the window's bottom edge reads it as a number (`useToastClearance`). Removed with the region.
 */
function useToastSlot(): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const set = () => {
      const rem = Number.parseFloat(getComputedStyle(root).fontSize) || 16;
      // The page gutter is 1rem (`--page-gutter`, styles.css).
      const gutter = rem;
      const bottom = window.innerHeight <= 400 ? gutter / 2 : gutter;
      root.style.setProperty(TOAST_BOTTOM_PROPERTY, `${bottom}px`);
      root.style.setProperty(TOAST_SLOT_PROPERTY, `${Math.ceil(bottom + (TOAST_HEIGHT_REM + TOAST_AIR_REM) * rem)}px`);
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
 * and covers no button, whatever the page, its bars or its scrolling columns are (#4063): the strip is held to `STRIP_MAX_SHARE` of the window (the toasts' text is capped to half of it, so the stack fits). With no toast the property is not set,
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
      const room = Math.ceil(window.innerHeight - first.getBoundingClientRect().top + 8);
      const modal = root.hasAttribute(MODAL_OPEN_ATTRIBUTE);
      root.style.setProperty(TOAST_HEIGHT_PROPERTY, `${modal ? room : Math.min(room, Math.floor(window.innerHeight * STRIP_MAX_SHARE))}px`);
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
/** The dialog a toast's Tab wraps into: the newest one open. */
const topModal = (): HTMLElement | null => [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].pop() ?? null;

// The messages the app shows, newest last. Neither region is atomic: a new message is read on its own, not every message again. Two live regions that are always mounted, so a screen reader hears a message that arrives
// later: errors interrupt (alert), everything else waits its turn (status). Base UI hides everything outside an open dialog from
// assistive technology except live regions carrying `aria-live`, and an error raised from inside a dialog is announced here.
export function ToastRegion({ messages: queued, dismiss }: { messages: readonly ToastMessage[]; dismiss: (id: number) => void }) {
  const region = useRef<HTMLDivElement>(null);
  // With a dialog open only the newest toast shows, at every window size, and its text is held to two lines: a toast that size fits the 4.75rem every dialog leaves under it, so it covers
  // no button and the dialog does not move when it comes or goes (#3605; a stack, or a message of three lines, was taller than that room at any width).
  // The older ones stay queued, unmounted, so their time starts when they appear, after the newest goes. An older information toast with an action is the exception: what its
  // action can still do is timed from when it was raised (the picker sends a removal 6 s after Remove), so it stays mounted, not drawn, with its clock running, and comes back
  // with the time it has left or not at all; shown afresh, its Undo answered "already removed" (qa on #3745).
  // With no dialog open there is no chrome to keep, and an older error with its Retry is not hidden by a newer message.
  const modal = useModalOpen();
  const messages = modal ? queued.slice(-1) : queued;
  const waits = (message: ToastMessage) => !messages.includes(message);
  const mounted = queued.filter((message) => !waits(message) || (message.tone === 'info' && message.action !== undefined));
  const showing = messages.length > 0;
  useToastSlot();
  useToastHeightPublished(region, showing);
  // Portalled to <body>: #root is an isolated stacking context (index.html), so a region inside it never beats the dialogs and slide-overs
  // the primitives portal to <body>, and a toast raised from one was drawn underneath it.
  return createPortal(
    <div
      ref={region}
      data-toast-region
      onKeyDown={(event) => routeTabAcrossToasts(event, topModal())}
      // While a modal is open, a press on a toast's plain text would take focus from the dialog's control to <body> (the toast is outside the dialog); a press on
      // the toast's own button or link is the browser's.
      onMouseDown={(event) => {
        if (document.documentElement.hasAttribute(MODAL_OPEN_ATTRIBUTE) && !(event.target as Element).closest('button, a, input, select, textarea, [tabindex]'))
          event.preventDefault();
      }}
      className="fixed right-[calc(var(--page-gutter)+var(--toast-clear-right,0px))] bottom-[var(--toast-bottom,var(--page-gutter))] z-[var(--z-toast)] flex max-w-[min(28rem,calc(100vw-2*var(--page-gutter)-var(--toast-clear-right,0px)))] flex-col items-end [&>div:not(:empty)+div:not(:empty)]:mt-2 [:root[data-modal-open]_&]:right-[var(--page-gutter)]"
    >
      <div role="alert" aria-live="assertive" aria-atomic="false" aria-relevant="additions" className="flex max-w-full flex-col items-end gap-2">
        {mounted
          .filter((message) => message.tone === 'error')
          .map((message) => (
            <ToastItem key={message.id} message={message} dismiss={dismiss} />
          ))}
      </div>
      <div role="status" aria-live="polite" aria-atomic="false" aria-relevant="additions" className="flex max-w-full flex-col items-end gap-2">
        {mounted
          .filter((message) => message.tone === 'info')
          .map((message) => (
            <ToastItem key={message.id} message={message} dismiss={dismiss} waiting={waits(message)} />
          ))}
      </div>
    </div>,
    document.body,
  );
}
