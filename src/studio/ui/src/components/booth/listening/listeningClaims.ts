/**
 * Who owns the host's one listening session (#3320). The host has a single session and `teleprompterStop` ends whatever runs, whoever asked, so every
 * press or cold read that wants to let a session go says first which session it means: it holds a claim, and it may stop the session only while the
 * claim is still the latest. The state is module-wide, not per Booth, because a press outlives the Booth that began it (the narrator leaves and comes
 * back while its listening start is out) and the Booth after it must be able to take the session over.
 *
 * - `claimListening`: a press or cold read that starts a session owns it.
 * - `joinListening`: a press that finds a session already running takes it over when a press owns it (the one that began it may have been
 *   cancelled and will not look again); a session the narrator started on its own, with no press behind it, is not taken.
 * - `ownsListening` / `releaseListening`: asked before every stop; a claim that was replaced stops nothing.
 * - `unclaimListening`: the start failed or was refused, so the claim goes away and the session, if one still runs, stays with the claim before it.
 */
export type ListeningClaim = symbol;

/**
 * The live claims, oldest first. The owner is the last: a claim that goes away (refused, released) hands the session back to the one before it. A claim whose
 * start never answered is dropped after `STALE_MS` (longer than the listening limit and the host's own): a session someone else started later is not the
 * session it meant, and a press that finds one running must not take it over.
 */
export const STALE_MS = 120_000;
let live: Array<{ claim: ListeningClaim; at: number }> = [];

const prune = (): void => {
  const now = Date.now();
  live = live.filter((item) => now - item.at < STALE_MS);
};

export const claimListening = (): ListeningClaim => {
  prune();
  const claim = Symbol('listening');
  live.push({ claim, at: Date.now() });
  return claim;
};

/** The claim of a press that joins the running session, or null when nobody's press owns it. */
export const joinListening = (): ListeningClaim | null => {
  prune();
  return live.length === 0 ? null : claimListening();
};

export const ownsListening = (claim: ListeningClaim | null): boolean => {
  prune();
  return claim !== null && live[live.length - 1]?.claim === claim;
};

/** True when some press or cold read holds a claim on the session. */
export const hasListeningClaim = (): boolean => {
  prune();
  return live.length > 0;
};

/** True when `claim` owned the session: the caller stops it now. Every older claim ended with it (the session they meant is gone). */
export const releaseListening = (claim: ListeningClaim | null): boolean => {
  if (!ownsListening(claim)) return false;
  live = [];
  return true;
};

/** The start failed or was refused: the claim goes away wherever it sits, and the claims before it keep their place (the session, if any, is still theirs). */
export const unclaimListening = (claim: ListeningClaim | null): void => {
  if (claim === null) return;
  live = live.filter((item) => item.claim !== claim);
};

/** For tests that share the module. */
export const forgetListeningClaims = (): void => {
  live = [];
};
