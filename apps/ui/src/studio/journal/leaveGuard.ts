// The leave guard: one page may stop a navigation and ask first (the Booth does while a take is recording). This file only
// stores the guard and answers `checkLeave`; the Booth registers its guard and the app shell asks before it navigates.
// `ConfirmSpec` is declared here so the journal does not import the overlay service.

/** What the confirmation shows. The overlay service renders it. */
export type ConfirmSpec = { title: string; body: string; confirmLabel: string; cancelLabel?: string };

/** The answer to "may the narrator leave for `next`?": go ahead, or ask this first. */
type LeaveVerdict = 'allow' | { ask: ConfirmSpec };

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
