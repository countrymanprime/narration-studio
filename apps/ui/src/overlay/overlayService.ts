import type { ReactNode } from 'react';
import type { ToastAction, ToastMessage, ToastTone } from '../components/primitives/Toast';

/** What a toast's Undo runs. Structurally the journal's `Result`, so the caller passes `entry.undo` without this folder importing the journal. */
type UndoResult = { ok: true } | { ok: false; refusal: { reason: string } };
type Undo = () => Promise<UndoResult>;

type ConfirmSpec = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
};
type DialogSpec =
  | {
      kind: 'dialog';
      title: string;
      /** A dialog without a header row; the title still names it for assistive technology. */
      headerless?: boolean;
      /** Whether a press outside the dialog closes it (issue 1706): true for a reference view or a picker with nothing to lose, false for a form or a confirm (ADR 0048). */
      dismissOnOutsidePress: boolean;
      render: (api: { close: () => void }) => ReactNode;
    }
  | {
      /** A slide-over always closes on a press outside, like the mock's side sheet. */
      kind: 'slideOver';
      title: string;
      render: (api: { close: () => void }) => ReactNode;
    };
type ToastOptions = { tone?: ToastTone; action?: ToastAction };

/** An open layer. The primitive that draws it owns focus, stacking and Escape (ADR 0048, 0172, 0630); this is only what to draw and who to tell. */
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
  toastUndo: (text: string, undo: Undo) => void;
  announce: (text: string) => void;
  open: (spec: DialogSpec) => () => void;
  dismissToast: (id: number) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => OverlaySnapshot;
};

/**
 * The overlay service (ADR 0781): imperative calls, specs and callbacks as state, no drawing. `OverlayHost` reads the snapshot and renders
 * the existing primitives, so focus return, stacking and Escape order stay theirs. It imports primitives only (decision 3).
 */
export function createOverlayService(): OverlayService {
  let snapshot: OverlaySnapshot = { dialogs: [], toasts: [], announcement: '' };
  let lastId = 0;
  const listeners = new Set<() => void>();
  const update = (next: Partial<OverlaySnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };
  const removeDialog = (id: number): boolean => {
    if (!snapshot.dialogs.some((entry) => entry.id === id)) return false;
    update({ dialogs: snapshot.dialogs.filter((entry) => entry.id !== id) });
    return true;
  };

  const toast = (text: string, options: ToastOptions = {}) => {
    if (!text) return;
    const message: ToastMessage = { id: ++lastId, text, tone: options.tone ?? 'info', action: options.action };
    const queue = [...snapshot.toasts, message];
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
    toastUndo: (text, undo) => {
      let pressed = false;
      toast(text, {
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
      });
    },
    announce: (text) => update({ announcement: text }),
    open: (spec) => {
      const id = ++lastId;
      const close = () => void removeDialog(id);
      update({ dialogs: [...snapshot.dialogs, { id, kind: spec.kind, spec, close }] });
      return close;
    },
    dismissToast: (id) => update({ toasts: snapshot.toasts.filter((message) => message.id !== id) }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}

/** The app's one service. Anything that is not a component imports this. */
export const overlay: OverlayService = createOverlayService();
