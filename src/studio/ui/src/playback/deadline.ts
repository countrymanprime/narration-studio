/**
 * How long a click that plays waits for the DAW before the app plays instead: a play click is never silent for the host's wait (`ASK_DEADLINE_MS` in `components/engine/ShowInDaw.tsx`), so a DAW
 * that has not answered a play in this time is passed over, and an answer that comes later is stopped (`PlayContext.late`). Not a write: a play that
 * lands late is stopped, so the limit need not outlast the host's wait (`lateWaitLimits.guard.test.ts` lists the limits that must).
 */
export const PLAY_DEADLINE_MS = 3_000;
