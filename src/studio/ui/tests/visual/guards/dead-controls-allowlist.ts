// Controls the dead-control guard (deadControls.spec.ts) reports and a fix has not reached yet, as `page > path > role name`, each with the
// issue that owns the fix. The list may only shrink: the spec fails on a control that is not listed and on an entry whose control now acts, so
// fixing a control means deleting its line. Never add a line to make the guard pass; fix the control (#3276).
export const DEAD_CONTROL_DEBT: Record<string, string> = {
  // Empty: the Engine panel's Confirm (#3275) was the last line and its fix has landed.
};

// Controls whose press is answered by a live timer as much as by the press (the track list re-reads itself every 5 s), so whether the guard
// sees "nothing happened" depends on when the timer fires. They are never reported as dead while listed here, and a listed control that does act
// is not a failure either. Owned by #3269; delete the line with its fix.
export const DEAD_CONTROL_TIMER_DRIVEN: Record<string, string> = {};
