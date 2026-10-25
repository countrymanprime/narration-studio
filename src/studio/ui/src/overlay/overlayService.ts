import type { ReactNode } from 'react';
import type { DialogSize } from '../components/primitives/Dialog';
import type { ToastAction, ToastMessage, ToastTone } from '../components/primitives/Toast';

/** What a toast's Undo runs. Structurally the journal's `Result`, so the caller passes `entry.undo` without this folder importing the journal. */
type UndoResult = { ok: true } | { ok: false; refusal: { reason: string } };
type Undo = () => Promise<UndoResult>;

type ConfirmSpec = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
  /** The decline button's name; "Cancel" when absent. */
  cancelLabel?: string;
  /** Focus opens on the decline button instead of the message, and closing leaves focus on <body> when it was there. For a question whose safe answer is to stay. */
  safeDefault?: boolean;
};
type DialogSpec =
  | {
      kind: 'dialog';
      title: string;
      /** A dialog without a header row; the title still names it for assistive technology. */
      headerless?: boolean;
      /** The width from Dialog's scale; `form` when absent. */
      size?: DialogSize;
      /** Whether a press outside the dialog closes it (issue 1706): true for a reference view or a picker with nothing to lose, false for a form or a confirm. */
      dismissOnOutsidePress: boolean;
      /** Where focus goes on close when the element that had it is gone (a menu item closes as it runs); absent, the page's <main>. */
      returnFocus?: () => HTMLElement | null;
      render: (api: { close: () => void }) => ReactNode;
    }
  | {
      /** A slide-over always closes on a press outside, like the mock's side sheet. */
      kind: 'slideOver';
      title: string;
      /** Where focus goes on close when the element that had it is gone (History opened from the jump menu); absent, what had focus before the first layer opened, then the page's <main>. */
      returnFocus?: () => HTMLElement | null;
      render: (api: { close: () => void }) => ReactNode;
    };
/** `topic` names what a message is about: a newer message on a topic replaces the one before it, and `dismissTopic` takes it away once it is no longer true. */
type ToastOptions = {
  tone?: ToastTone;
  action?: ToastAction;
  topic?: string;
  /** How long an information message stays, when longer than the usual five seconds. */ durationMs?: number;
};

/** An open layer. The primitive that draws it owns focus, stacking and Escape; this is only what to draw and who to tell. */
export type DialogEntry =
  | { id: number; kind: 'confirm'; spec: ConfirmSpec; answer: (confirmed: boolean) => void }
  | { id: number; kind: DialogSpec['kind']; spec: DialogSpec; close: () => void };

type OverlaySnapshot = {
  /** Oldest first: a later entry stacks above an earlier one. */
  dialogs: readonly DialogEntry[];
  toasts: readonly ToastMessage[];
  announcement: string;
};

/** How many toasts show at once; the oldest information toast goes first, then the oldest error. */
const OVERLAY_TOAST_LIMIT = 4;

export type OverlayService = {
  confirm: (spec: ConfirmSpec) => Promise<boolean>;
  toast: (text: string, options?: ToastOptions) => void;
  /** A message with an Undo; `durationMs` keeps it longer than the usual five seconds. */
  toastUndo: (text: string, undo: Undo, options?: { durationMs?: number; entry?: number }) => void;
  /**
   * Takes away the Undo toasts whose journal `entry` `live` no longer holds (undone from the header, the keys or History; cleared by a project
   * switch; pushed out). An Undo toast with no `entry` is left to `dismissUndo`.
   */
  settleUndo: (live: (entry: number) => boolean) => void;
  /** Takes away every Undo toast: what they offered to undo belongs to a page, chapter or project the narrator has left. */
  dismissUndo: () => void;
  announce: (text: string) => void;
  open: (spec: DialogSpec) => () => void;
  dismissToast: (id: number) => void;
  /** Takes away the message on a topic, for a message that has stopped being true ("REAPER is starting" once REAPER answers). */
  dismissTopic: (topic: string) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => OverlaySnapshot;
};

/**
 * The overlay service: imperative calls, specs and callbacks as state, no drawing. `OverlayHost` reads the snapshot and renders
 * the existing primitives, so focus return, stacking and Escape order stay theirs. It imports primitives only (decision 3).
 */
export function createOverlayService(): OverlayService {
  let snapshot: OverlaySnapshot = { dialogs: [], toasts: [], announcement: '' };
  let lastId = 0;
  // The control that had focus when each layer opened. A layer opened from another layer (History from the jump menu) inherits the
  // opener of the layer it came from: that layer is closing, so its own controls will be gone when this one closes.
  const openers = new Map<number, HTMLElement | null>();
  // The opener of the layer closed last: the jump menu closes, then runs its command, while its own field still has focus.
  let closedOpener: HTMLElement | null = null;
  const openerNow = (): HTMLElement | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return null;
    if (active.closest('[role="dialog"], [role="alertdialog"], [data-slide-over]')) {
      const top = snapshot.dialogs[snapshot.dialogs.length - 1];
      return top ? (openers.get(top.id) ?? null) : closedOpener;
    }
    return active;
  };
  const listeners = new Set<() => void>();
  const update = (next: Partial<OverlaySnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };
  const removeDialog = (id: number): boolean => {
    if (!snapshot.dialogs.some((entry) => entry.id === id)) return false;
    closedOpener = openers.get(id) ?? null;
    openers.delete(id);
    update({ dialogs: snapshot.dialogs.filter((entry) => entry.id !== id) });
    return true;
  };

  const toast = (text: string, options: ToastOptions = {}, undo?: ToastMessage['undo']) => {
    if (!text) return;
    const tone = options.tone ?? 'info';
    const message: ToastMessage = { id: ++lastId, text, tone, action: options.action, topic: options.topic, durationMs: options.durationMs, undo };
    // A message that says what one on screen already says, with the same action or none, is that message again, and one on the same topic
    // is its newer word: either replaces the old one (its timer starts again), so a repeated press, three adds in a row ("Milestone added."
    // with its Undo) or a lost-and-found DAW never stacks the same sentence (alignment audit cause P). An Undo that replaces another takes
    // back the newest change; History still holds the earlier ones.
    const again = (old: ToastMessage) =>
      (options.topic !== undefined && old.topic === options.topic) || (old.action?.label === options.action?.label && old.text === text && old.tone === tone);
    const queue = [...snapshot.toasts.filter((old) => !again(old)), message];
    while (queue.length > OVERLAY_TOAST_LIMIT) {
      const info = queue.slice(0, -1).findIndex((m) => m.tone === 'info');
      queue.splice(info >= 0 ? info : 0, 1);
    }
    update({ toasts: queue });
  };

  return {
    confirm: (spec) =>
      new Promise<boolean>((resolve) => {
        const id = ++lastId;
        const answer = (confirmed: boolean) => {
          if (removeDialog(id)) resolve(confirmed);
        };
        update({ dialogs: [...snapshot.dialogs, { id, kind: 'confirm', spec, answer }] });
      }),
    toast,
    toastUndo: (text, undo, options) => {
      let pressed = false;
      toast(
        text,
        {
          durationMs: options?.durationMs,
          action: {
            label: 'Undo',
            onAction: () => {
              if (pressed) return;
              pressed = true;
              // The toast closes itself when Undo is pressed; a refusal says why in a toast of its own.
              void undo().then((result) => {
                if (!result.ok) toast(result.refusal.reason);
              });
            },
          },
        },
        { entry: options?.entry },
      );
    },
    settleUndo: (live) => {
      const gone = (m: ToastMessage) => m.undo?.entry !== undefined && !live(m.undo.entry);
      if (snapshot.toasts.some(gone)) update({ toasts: snapshot.toasts.filter((m) => !gone(m)) });
    },
    dismissUndo: () => {
      if (snapshot.toasts.some((m) => m.undo)) update({ toasts: snapshot.toasts.filter((m) => !m.undo) });
    },
    announce: (text) => update({ announcement: text }),
    open: (spec) => {
      const id = ++lastId;
      const close = () => void removeDialog(id);
      const opener = openerNow();
      openers.set(id, opener);
      // Where focus goes when the control that had it is gone: the layer's own say first, then what had focus before the chain of layers began.
      const returnFocus = () => spec.returnFocus?.() ?? (opener?.isConnected ? opener : null);
      update({ dialogs: [...snapshot.dialogs, { id, kind: spec.kind, spec: { ...spec, returnFocus }, close }] });
      return close;
    },
    dismissToast: (id) => update({ toasts: snapshot.toasts.filter((message) => message.id !== id) }),
    dismissTopic: (topic) => {
      if (snapshot.toasts.some((message) => message.topic === topic)) update({ toasts: snapshot.toasts.filter((message) => message.topic !== topic) });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}

/** The app's one service. Anything that is not a component imports this. */
export const overlay: OverlayService = createOverlayService();
