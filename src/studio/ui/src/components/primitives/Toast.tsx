import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faCircleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { HIT_AREA } from './hitArea';

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
  /** How many times the same message was raised again while this one showed: the same toast, its time starting over (so a focused toast is not unmounted). */
  again?: number;
  /** Set on an Undo toast by the overlay service: the toast offers to take a change back, and goes when that change is no longer there to take back. */
  undo?: { entry?: number };
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

function ToastItem({ message, dismiss }: { message: ToastMessage; dismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  // A message taller than the toast may be is read by scrolling its text, which then needs the keyboard too: it takes focus only while it overflows.
  const text = useRef<HTMLSpanElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = text.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [message.text]);
  const isError = message.tone === 'error';
  const { id } = message;
  const stays = toastLifetimeMs(message);
  // A pointer resting on the toast or focus inside it holds the timer; leaving starts the full time again, so a message is never taken from under a hand or a key.
  const hover = useRef(false);
  const focused = useRef(false);
  const [held, setHeld] = useState(false);
  const hold = () => setHeld(hover.current || focused.current);
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
  }, [dismiss, id, stays, held, message.again]);
  return (
    <div
      data-tone={message.tone}
      onPointerEnter={() => ((hover.current = true), hold())}
      onPointerLeave={() => ((hover.current = false), hold())}
      onFocus={(event) => {
        focused.current = true;
        hold();
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && !event.currentTarget.contains(from)) origin.current = from;
      }}
      onKeyDown={(event) => {
        // Escape dismisses the toast that has focus, as its Dismiss button does; the key is the toast's, so it does not also close a dialog or leave the page.
        if (event.key !== 'Escape' || !(event.target instanceof HTMLElement)) return;
        event.preventDefault();
        event.stopPropagation();
        settle(event.target, true);
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        focused.current = false;
        hold();
      }}
      // Inverted in both themes (src/studio/ui/src/styles.css's --toast-bg/--toast-text), 45 px tall with a leading glyph, radius 6
      // (daw-chapter-track-auto-sync/03). An error's 4 px --danger edge is a strip inside the clipped box, not a border, so it runs straight
      // down the left and the box's corners clip it, rather than a border bending round the radius (alignment audit R3PF-4).
      className={`relative flex min-h-[2.8125rem] max-w-full items-center gap-[0.625rem] overflow-hidden rounded-[var(--radius-button)] bg-[var(--toast-bg)] py-1.5 pr-1.5 pl-4 text-[0.85rem] text-[var(--toast-text)] shadow-[var(--shadow)] motion-ok:animate-[toast-in_var(--motion-fast)_var(--ease-enter)] motion-ok:transition-[opacity,transform] motion-ok:duration-(--motion-fast) motion-ok:ease-(--ease-exit) ${leaving ? 'translate-y-1 opacity-0' : 'opacity-100'}`}
    >
      {isError && <span data-toast-edge aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[var(--danger)]" />}
      {isError ? (
        <FontAwesomeIcon icon={faCircleExclamation} aria-hidden="true" />
      ) : (
        message.icon && <FontAwesomeIcon icon={message.icon} aria-hidden="true" className="flex-none" />
      )}
      <span
        ref={text}
        data-toast-text
        dir="auto"
        tabIndex={scrolls ? 0 : undefined}
        // A long message (one word of 10,000 letters, a pasted error) wraps anywhere and scrolls inside the toast. The toasts showing share the window less its gutters and
        // the bars they rise above (`--toast-n` of them, set on the region), so every toast's action and Dismiss stay on screen (#2899).
        className="max-h-[max(1.5rem,calc((100dvh-2*var(--page-gutter)-var(--toast-reserve,0px)-(var(--toast-n,1)-1)*0.5rem)/var(--toast-n,1)-1.5rem))] min-w-0 overflow-y-auto [overflow-wrap:anywhere]"
      >
        {message.text}
      </span>
      {message.action && (
        <button
          title={message.action.label}
          className={`line-clamp-3 max-w-[40%] flex-none text-left font-semibold [overflow-wrap:anywhere] underline underline-offset-2 ${HIT_AREA}`}
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

// The region keeps the page gutter from the window's right and bottom edges, where the top bar's and the footer's content end (alignment audit XBO-13).
// While a modal dialog is open the toasts stay in the window's bottom-right corner, at the gutter: a dialog hangs from the top and stops at
// least 4.75rem above the bottom edge (`Dialog`), so a toast there is clear of its action row (alignment audit cause P), and the bars a toast
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
export function ToastRegion({ messages, dismiss }: { messages: readonly ToastMessage[]; dismiss: (id: number) => void }) {
  // Portalled to <body>: #root is an isolated stacking context (index.html), so a region inside it never beats the dialogs and slide-overs
  // the primitives portal to <body>, and a toast raised from one was drawn underneath it.
  return createPortal(
    <div
      data-toast-region
      style={
        {
          '--toast-n': Math.max(1, messages.length),
          // The bars the toasts rise above (`--toast-clear`, the Booth's footer and notice) never take more of a short window than leaves the toasts 8rem to stand in.
          '--toast-reserve': 'min(var(--toast-clear, 0px), calc(100dvh - 2 * var(--page-gutter) - 8rem))',
        } as CSSProperties
      }
      onKeyDown={(event) => routeTabAcrossToasts(event, topModal())}
      className="fixed right-[calc(var(--page-gutter)+var(--toast-clear-right,0px))] bottom-[calc(var(--page-gutter)+var(--toast-reserve,0px))] z-[var(--z-toast)] flex max-w-[min(28rem,calc(100vw-2*var(--page-gutter)-var(--toast-clear-right,0px)))] flex-col items-end gap-2 [:root[data-modal-open]_&]:right-[var(--page-gutter)] [:root[data-modal-open]_&]:bottom-[var(--page-gutter)]"
    >
      <div role="alert" aria-live="assertive" aria-atomic="false" aria-relevant="additions" className="flex max-w-full flex-col items-end gap-2">
        {messages
          .filter((message) => message.tone === 'error')
          .map((message) => (
            <ToastItem key={message.id} message={message} dismiss={dismiss} />
          ))}
      </div>
      <div role="status" aria-live="polite" aria-atomic="false" aria-relevant="additions" className="flex max-w-full flex-col items-end gap-2">
        {messages
          .filter((message) => message.tone === 'info')
          .map((message) => (
            <ToastItem key={message.id} message={message} dismiss={dismiss} />
          ))}
      </div>
    </div>,
    document.body,
  );
}
