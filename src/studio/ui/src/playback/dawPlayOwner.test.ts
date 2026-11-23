import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dawPlayOwner } from './dawPlayOwner';

// The DAW's play is one thing: an old answer never stops a newer press's play, but a play that landed while a newer press owned the DAW is stopped when
// that press gives the DAW up without playing in it (#4076, qa).
beforeEach(() => dawPlayOwner.forget());

/** Two presses, the second (`b`) the owner of the DAW; `stop` is the older press `a`'s stop, handed to `stopOrOrphan`. */
function olderAnswerWhileNewerOwns() {
  const a = dawPlayOwner.begin();
  dawPlayOwner.claim(a);
  const b = dawPlayOwner.begin();
  dawPlayOwner.claim(b);
  const stop = vi.fn();
  dawPlayOwner.stopOrOrphan(a, stop);
  return { a, b, stop };
}

describe('dawPlayOwner.stopOrOrphan', () => {
  it('stops at once a play whose press still owns the DAW, and gives the DAW up', () => {
    const a = dawPlayOwner.begin();
    dawPlayOwner.claim(a);
    const stop = vi.fn();
    dawPlayOwner.stopOrOrphan(a, stop);
    expect(stop).toHaveBeenCalledTimes(1);
    // The DAW is nobody's now: a later answer of another press stops at once too.
    const later = vi.fn();
    dawPlayOwner.stopOrOrphan(dawPlayOwner.begin(), later);
    expect(later).toHaveBeenCalledTimes(1);
  });
  it('stops at once when nobody owns the DAW', () => {
    const stop = vi.fn();
    dawPlayOwner.stopOrOrphan(dawPlayOwner.begin(), stop);
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('does not stop an older answer while a newer press owns the DAW', () => {
    const { stop } = olderAnswerWhileNewerOwns();
    expect(stop).not.toHaveBeenCalled();
  });
  it('stops an orphaned play when the newer press releases the DAW without playing', () => {
    const { b, stop } = olderAnswerWhileNewerOwns();
    dawPlayOwner.release(b);
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('drops an orphaned play when the newer press settles in the DAW (its play replaced the old one)', () => {
    const { b, stop } = olderAnswerWhileNewerOwns();
    dawPlayOwner.settle(b);
    dawPlayOwner.release(b);
    expect(stop).not.toHaveBeenCalled();
  });
  it('ignores a release from a press that no longer owns the DAW', () => {
    const { a, stop } = olderAnswerWhileNewerOwns();
    dawPlayOwner.release(a);
    expect(stop).not.toHaveBeenCalled();
  });
  it('an untokened release (Stop) runs the orphaned stops', () => {
    const { stop } = olderAnswerWhileNewerOwns();
    dawPlayOwner.release();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
