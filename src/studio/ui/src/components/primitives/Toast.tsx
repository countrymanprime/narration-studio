import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faCircleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HIT_AREA } from './hitArea';

export type ToastTone = 'info' | 'error';
/** A toast's one action (for example Undo): its own label, run when pressed, which also dismisses the toast. */
export type ToastAction = { label: string; onAction: () => void };
/** The Retry a failure toast carries where repeating the action is safe (a start that the host guards or an idempotent save). */
export const retryAction = (retry: () => void): ToastAction => ({ label: 'Retry', onAction: retry });
/** `durationMs` is how long an information message stays when it needs longer than `TOAST_INFO_MS` (an Undo the narrator may want ten seconds for). */
export type ToastMessage = {
  id: number;
  text: string;
  tone: ToastTone;
  action?: ToastAction;
  icon?: IconDefinition;
  topic?: string;
  durationMs?: number;
  /** Set on an Undo toast by the overlay service: the toast offers to take a change back, and goes when that change is no longer there to take back. */
  undo?: { entry?: number };
};
/** How a page or a component tells the narrator something. An error is announced at once and stays until it is dismissed.
 * `action` adds one button (for example Undo) before the dismiss button; pressing it runs the action and dismisses the toast.
 * `icon` leads an information message with the glyph of what it is about (the track glyph for a chapter sync); an error always
 * leads with its warning glyph. */
export type Notify = (text: string, tone?: ToastTone, action?: ToastAction, icon?: IconDefinition) => void;

/** How long an information message stays. An error has no timer. */
export const TOAST_INFO_MS = 5_000;
const FADE_MS = 150;

function ToastItem({ message, dismiss }: { message: ToastMessage; dismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const sticky = message.tone === 'error';
  const { id } = message;
  const stays = message.durationMs ?? TOAST_INFO_MS;
  useEffect(() => {
    if (sticky) return;
    const fade = window.setTimeout(() => setLeaving(true), stays - FADE_MS);
    const remove = window.setTimeout(() => dismiss(id), stays);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, [dismiss, id, sticky, stays]);
  return (
    <div
      data-tone={message.tone}
      // Inverted in both themes (src/studio/ui/src/styles.css's --toast-bg/--toast-text), 45 px tall with a leading glyph, radius 6
      // (daw-chapter-track-auto-sync/03). An error's 4 px --danger edge is a strip inside the clipped box, not a border, so it runs straight
      // down the left and the box's corners clip it, rather than a border bending round the radius (alignment audit R3PF-4).
      className={`relative flex min-h-[2.8125rem] items-center gap-[0.625rem] overflow-hidden rounded-[var(--radius-button)] bg-[var(--toast-bg)] py-1.5 pr-1.5 pl-4 text-[0.85rem] text-[var(--toast-text)] shadow-[var(--shadow)] motion-ok:animate-[toast-in_var(--motion-fast)_var(--ease-enter)] motion-ok:transition-[opacity,transform] motion-ok:duration-(--motion-fast) motion-ok:ease-(--ease-exit) ${leaving ? 'translate-y-1 opacity-0' : 'opacity-100'}`}
    >
      {sticky && <span data-toast-edge aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[var(--danger)]" />}
      {sticky ? (
        <FontAwesomeIcon icon={faCircleExclamation} aria-hidden="true" />
      ) : (
        message.icon && <FontAwesomeIcon icon={message.icon} aria-hidden="true" className="flex-none" />
      )}
      <span className="min-w-0 break-words">{message.text}</span>
      {message.action && (
        <button
          className={`flex-none font-semibold underline underline-offset-2 ${HIT_AREA}`}
          onClick={() => {
            message.action!.onAction();
            dismiss(id);
          }}
        >
          {message.action.label}
        </button>
      )}
      {/* A 32 px square, the small IconButton's size, where the bare glyph was a 17 x 20 target (XBO-13, R3SE2-4, R3PF-4). */}
      <button
        aria-label="Dismiss message"
        className="inline-flex size-[var(--button-height-sm)] flex-none items-center justify-center rounded-[var(--radius-button)] hover:opacity-75"
        onClick={() => dismiss(id)}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}

// While a modal dialog is open the toasts move to the top of the window, clear of the dialog's action row, which they covered at the bottom
// (alignment audit cause P). A dialog says it is open with `useToastsClearOfModal`; the count keeps two stacked dialogs from clearing it early.
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

// The messages the app shows, newest last. Neither region is atomic: a new message is read on its own, not every message again. Two live regions that are always mounted, so a screen reader hears a message that arrives
// later: errors interrupt (alert), everything else waits its turn (status). Base UI hides everything outside an open dialog from
// assistive technology except live regions carrying `aria-live`, and an error raised from inside a dialog is announced here.
export function ToastRegion({ messages, dismiss }: { messages: readonly ToastMessage[]; dismiss: (id: number) => void }) {
  // Portalled to <body>: #root is an isolated stacking context (index.html), so a region inside it never beats the dialogs and slide-overs
  // the primitives portal to <body>, and a toast raised from one was drawn underneath it.
  return createPortal(
    <div
      data-toast-region
      className="fixed right-[calc(1.25rem+var(--toast-clear-right,0px))] bottom-[calc(1.25rem+var(--toast-clear,0px))] z-[var(--z-toast)] flex max-w-[min(28rem,calc(100vw-2.5rem-var(--toast-clear-right,0px)))] flex-col items-end gap-2 [:root[data-modal-open]_&]:top-4 [:root[data-modal-open]_&]:bottom-auto"
    >
      <div role="alert" aria-live="assertive" aria-atomic="false" aria-relevant="additions" className="flex flex-col items-end gap-2">
        {messages
          .filter((message) => message.tone === 'error')
          .map((message) => (
            <ToastItem key={message.id} message={message} dismiss={dismiss} />
          ))}
      </div>
      <div role="status" aria-live="polite" aria-atomic="false" aria-relevant="additions" className="flex flex-col items-end gap-2">
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
