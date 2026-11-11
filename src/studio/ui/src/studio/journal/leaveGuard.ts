// The leave guard: one page may stop a navigation and ask first (the Booth does while a take is recording). This file only
// stores the guard and answers `checkLeave`; the Booth registers its guard and the app shell asks before it navigates.
// `ConfirmSpec` is declared here so the journal does not import the overlay service.

/** What the confirmation shows. The overlay service renders it. */
export type ConfirmSpec = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  safeDefault?: boolean;
  /** The confirm button ignores a press for this long after the question appears: for a question that replaces another under the same pixels, so a double-click on the first cannot answer the second. */
  armAfterMs?: number;
  /** No Enter or Space is taken for this long after the question appears, whichever button has focus: for a question raised by a key the narrator may press twice. A click and Escape are not held back. */
  ignoreEnterAfterMs?: number;
};

/** The answer to "may the narrator leave for `next`?": go ahead, or ask this first. */
type LeaveVerdict =
  | 'allow'
  | {
      ask: ConfirmSpec;
      /**
       * The page's own way of putting the question and letting go of what it holds (the Booth stops the take, and a stop the DAW refuses keeps the
       * narrator in the Booth). It resolves true once the move may go ahead, false when the narrator stayed. A shell that finds it uses it in
       * place of confirming `ask` itself, so every exit ends the same way Escape does.
       */
      decide?: () => Promise<boolean>;
    };

type LeaveGuard = (next: string) => LeaveVerdict;

export type LeaveGuardStore = {
  /** Replaces the guard; `null` removes it. */
  setLeaveGuard(guard: LeaveGuard | null): void;
  checkLeave(next: string): LeaveVerdict;
};

export function createLeaveGuard(): LeaveGuardStore {
  let guard: LeaveGuard | null = null;
  return {
    setLeaveGuard: (next) => {
      guard = next;
    },
    checkLeave: (next) => guard?.(next) ?? 'allow',
  };
}
