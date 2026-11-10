// Controls the dead-control guard (deadControls.spec.ts) reports and a fix has not reached yet, as `page > path > role name`, each with the
// issue that owns the fix. The list may only shrink: the spec fails on a control that is not listed and on an entry whose control now acts, so
// fixing a control means deleting its line. Never add a line to make the guard pass; fix the control (#3276).
export const DEAD_CONTROL_DEBT: Record<string, string> = {
  // The Engine page link panel (#3275, #3258, #3274, #3269 own it; #3276 only found these): Confirm is off with no reason a keyboard reaches.
  'Booth > button|Recording setup: REAPER#1 > button Confirm': '#3275',
  'Production > button|REAPER: Linked#1 > button Confirm': '#3275',
  'Shell > button|REAPER: Linked#1 > button Confirm': '#3275',
};

// Controls whose press is answered by a live timer as much as by the press (the track list re-reads itself every 5 s), so whether the guard
// sees "nothing happened" depends on when the timer fires. They are never reported as dead while listed here, and a listed control that does act
// is not a failure either. Owned by #3269; delete the line with its fix.
export const DEAD_CONTROL_TIMER_DRIVEN: Record<string, string> = {
  ' > button Read the tracks from REAPER again': '#3269',
};
