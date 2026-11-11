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
 * - `unclaimListening`: the start failed, so the claim goes back to who held it, and a session still running is not orphaned.
 */
export type ListeningClaim = symbol;

let owner: ListeningClaim | null = null;
/** What each live claim replaced, so a failed start can hand the session back. */
const replaced = new Map<ListeningClaim, ListeningClaim | null>();

export const claimListening = (): ListeningClaim => {
  const claim = Symbol('listening');
  replaced.set(claim, owner);
  owner = claim;
  return claim;
};

/** The claim of a press that joins the running session, or null when nobody's press owns it. */
export const joinListening = (): ListeningClaim | null => (owner === null ? null : claimListening());

export const ownsListening = (claim: ListeningClaim | null): boolean => claim !== null && owner === claim;

/** True when `claim` owned the session: the caller stops it now. */
export const releaseListening = (claim: ListeningClaim | null): boolean => {
  if (!ownsListening(claim)) return false;
  owner = null;
  replaced.delete(claim!);
  return true;
};

export const unclaimListening = (claim: ListeningClaim | null): void => {
  if (claim === null) return;
  if (owner === claim) owner = replaced.get(claim) ?? null;
  replaced.delete(claim);
};

/** The session ended some other way (a take's stop, a cold read's toggle): no press owns it any more. */
export const endListeningClaims = (): void => {
  owner = null;
  replaced.clear();
};
