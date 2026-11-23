/**
 * Which press owns the DAW's play right now, across notes, lists and page visits (a `useNewestPlay` counter is per mount, so it cannot say). A press
 * `begin`s with a token, `claim`s the DAW when it sends its play, `settle`s once the DAW is really playing it, and `release`s the DAW when it stops or
 * ends in the app. An answer that comes late, or for a note or list that was left, `mayStop` what it started only when no newer press has claimed
 * the DAW since; when it may not, it `orphan`s its stop, which runs when the newer press releases the DAW without playing in it (the old play would
 * otherwise run on), and is dropped when the newer press settles (the DAW's one play is then the newer one).
 */
let begun = 0;
let owner = 0;
let orphans: Array<() => void> = [];

export const dawPlayOwner = {
  /** A new press's token. */
  begin: (): number => ++begun,
  /** The press sent the DAW a play: the DAW's play is its now. */
  claim: (token: number): void => {
    owner = token;
  },
  /** The press's own play is the DAW's play now: older plays that landed meanwhile were replaced by it. */
  settle: (token: number): void => {
    if (owner === token) orphans = [];
  },
  /** The DAW's play is nobody's (stopped, refused or ended in the app); with a token, only if that press still owns it. Stops the plays orphaned meanwhile. */
  release: (token?: number): void => {
    if (token !== undefined && owner !== token) return;
    owner = 0;
    const stops = orphans;
    orphans = [];
    for (const stop of stops) stop();
  },
  /** An answer for `token`'s play may stop it: the DAW is nobody's, or still this press's. */
  mayStop: (token: number): boolean => owner === 0 || owner === token,
  /** A play that landed while a newer press owned the DAW: stop it if that press gives the DAW up without playing in it. */
  orphan: (stop: () => void): void => {
    orphans.push(stop);
  },
};
