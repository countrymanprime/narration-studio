/**
 * How long the Booth waits between asking a listening session to pause or resume and the sound starting or the listening coming back: one capture chunk of
 * the speech recognizer (0.32 s, `CHUNK_SECONDS` in the teleprompter sidecar), which is how often it reads the control file, and a little more. The
 * phase 5 spike in docs/prds/character-voice-samples.prd.md explains it.
 */
export const PAUSE_GRACE_MS = 350;

/** What the Booth says when the DAW has gone quiet, so it cannot tell whether a take is recording. */
export function cantTellSentence(checkedAt: number | null, now: number): string {
  const heard = checkedAt === null ? 'not heard yet' : `last heard ${Math.max(0, Math.round((now - checkedAt) / 1000))} s ago`;
  return `Can't tell whether a take is recording (${heard}).`;
}
