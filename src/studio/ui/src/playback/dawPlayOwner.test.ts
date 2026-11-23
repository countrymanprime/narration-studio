import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dawPlayOwner } from './dawPlayOwner';

// The DAW's play is one thing: an old answer never stops a newer press's play, but a play that landed while a newer press owned the DAW is stopped when
// that press gives the DAW up without playing in it (#4076, qa).
beforeEach(() => dawPlayOwner.release());

describe('dawPlayOwner', () => {
  it('lets an answer stop its own play when nobody else owns the DAW', () => {
    const a = dawPlayOwner.begin();
    dawPlayOwner.claim(a);
    expect(dawPlayOwner.mayStop(a)).toBe(true);
  });
  it('does not let an older answer stop a newer press that claimed the DAW', () => {
    const a = dawPlayOwner.begin();
    dawPlayOwner.claim(a);
    const b = dawPlayOwner.begin();
    dawPlayOwner.claim(b);
    expect(dawPlayOwner.mayStop(a)).toBe(false);
    expect(dawPlayOwner.mayStop(b)).toBe(true);
  });
  it('stops an orphaned play when the newer press releases the DAW without playing', () => {
    const a = dawPlayOwner.begin();
    dawPlayOwner.claim(a);
    const b = dawPlayOwner.begin();
    dawPlayOwner.claim(b);
    const stop = vi.fn();
    dawPlayOwner.orphan(stop);
    dawPlayOwner.release(b);
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('drops an orphaned play when the newer press settles in the DAW (its play replaced the old one)', () => {
    const a = dawPlayOwner.begin();
    dawPlayOwner.claim(a);
    const b = dawPlayOwner.begin();
    dawPlayOwner.claim(b);
    const stop = vi.fn();
    dawPlayOwner.orphan(stop);
    dawPlayOwner.settle(b);
    dawPlayOwner.release(b);
    expect(stop).not.toHaveBeenCalled();
  });
  it('ignores a release from a press that no longer owns the DAW', () => {
    const a = dawPlayOwner.begin();
    dawPlayOwner.claim(a);
    const b = dawPlayOwner.begin();
    dawPlayOwner.claim(b);
    const stop = vi.fn();
    dawPlayOwner.orphan(stop);
    dawPlayOwner.release(a);
    expect(stop).not.toHaveBeenCalled();
    expect(dawPlayOwner.mayStop(b)).toBe(true);
  });
});
