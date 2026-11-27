/**
 * Which press owns the DAW's play right now, across notes, lists and page visits (a `useNewestPlay` counter is per mount, so it cannot say). A press
 * `begin`s with a token, `claim`s the DAW when it sends its play, `settle`s once the DAW is really playing it, and `release`s the DAW when it stops or
 * ends in the app. An answer that comes late, or for a note or list that was left, stops what it started (`stopOrOrphan`) only when no newer press has claimed
 * the DAW since; when one has, its stop is orphaned, which runs when the newer press releases the DAW without playing in it (the old play would
 * otherwise run on), and is dropped when the newer press settles (the DAW's one play is then the newer one). A press that settles hands over the stop of its play
 * (`settle(token, stop)`): when a newer press then `release(token)`s the DAW without playing in it (the DAW refused it, or it ended in the app), the older play's stop runs, so it does not sound beside the app. A press the DAW is never asked about does not reach `release(token)`; the script stops the DAW itself for it (`useScriptPlayback`'s `notAsked`). The record is kept until a release: a play that ended with no release (a page left) is stopped again by the next refused press, which does no harm. One owner is kept for the whole app for each kind of
 * play (`createPlayOwner`), so the untokened `release()` of a Stop assumes one page plays at a time (Proof and Pickups are never on screen together).
 */

/** One owner of one kind of DAW play. The transport (the script, Hear it, Pickups) has `dawPlayOwner`; the DAW's file preview (a take's audition) is a second play in the DAW, so it has its own. */
export function createPlayOwner() {
  let begun = 0;
  let owner = 0;
  let orphans: Array<() => void> = [];
  /** The press whose play is playing in the DAW now and how to stop it, so a newer press the DAW refuses stops it before the app plays. */
  let playing: { token: number; stop: () => void } | null = null;

  const self = {
    /** A new press's token. */
    begin: (): number => ++begun,
    /** The press sent the DAW a play: the DAW's play is its now. */
    claim: (token: number): void => {
      owner = token;
    },
    /** The press's own play is the DAW's play now: older plays that landed meanwhile were replaced by it. `stop` stops it, for a newer press that is refused. */
    settle: (token: number, stop: () => void): void => {
      if (owner !== token) return;
      orphans = [];
      playing = { token, stop };
    },
    /** The DAW's play is nobody's (stopped, refused or ended in the app); with a token, only if that press still owns it. Stops the plays orphaned meanwhile. */
    release: (token?: number): void => {
      if (token !== undefined && owner !== token) return;
      owner = 0;
      // A newer press that ends without playing in the DAW (refused, or played in the app) leaves the older settled play running beside it: stop it.
      // A Stop (no token) stops what it stops itself.
      const older = playing;
      playing = null;
      if (token !== undefined && older && older.token !== token) older.stop();
      const stops = orphans;
      orphans = [];
      for (const stop of stops) stop();
    },
    /** `token`'s play came back when its press no longer wants it: stop it now and give the DAW up if nobody newer owns it, else stop it only if that press gives the DAW up without playing in it. */
    stopOrOrphan: (token: number, stop: () => void): void => {
      if (owner !== 0 && owner !== token) {
        orphans.push(stop);
        return;
      }
      stop();
      self.release(token);
    },
    /** Forgets every owner and orphan without running them: for a test's start, so one test's stops never run in the next. */
    forget: (): void => {
      owner = 0;
      orphans = [];
      playing = null;
    },
  };
  return self;
}

/** The DAW's transport play, one for the whole app. */
export const dawPlayOwner = createPlayOwner();
/** The DAW's file preview (a take's audition), one for the whole app: not the transport, so it does not share an owner with it. */
export const previewPlayOwner = createPlayOwner();
