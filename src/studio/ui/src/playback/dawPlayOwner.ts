/**
 * Which press owns the DAW's play right now, across notes, lists and page visits (a `useNewestPlay` counter is per mount, so it cannot say). A press
 * `begin`s with a token, `claim`s the DAW when it sends its play, and `release`s it when it stops or ends in the app. An answer that comes late, or for
 * a note or list that was left, `mayStop` what it started only when no newer press has claimed the DAW since: a newer play is never stopped by an old answer.
 */
let begun = 0;
let owner = 0;

export const dawPlayOwner = {
  /** A new press's token. */
  begin: (): number => ++begun,
  /** The press sent the DAW a play: the DAW's play is its now. */
  claim: (token: number): void => {
    owner = token;
  },
  /** The DAW's play is nobody's (stopped, refused or ended in the app); with a token, only if that press still owns it. */
  release: (token?: number): void => {
    if (token === undefined || owner === token) owner = 0;
  },
  /** An answer for `token`'s play may stop it: the DAW is nobody's, or still this press's. */
  mayStop: (token: number): boolean => owner === 0 || owner === token,
};
