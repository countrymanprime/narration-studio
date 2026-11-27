import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAY_DEADLINE_MS } from '../components/engine/ShowInDaw';
import { stopAndSay } from './stopAndSay';

describe('stopAndSay', () => {
  it('says nothing when the DAW stopped', async () => {
    const say = vi.fn();
    await stopAndSay('REAPER', say, async () => null);
    expect(say).not.toHaveBeenCalled();
  });
  it('says the refusal and where to stop it', async () => {
    const say = vi.fn();
    await stopAndSay('REAPER', say, async () => 'REAPER would not stop');
    expect(say).toHaveBeenCalledWith('REAPER would not stop. Stop it in REAPER.');
  });
  it('says who was not asked when the call throws, and never rejects', async () => {
    const say = vi.fn();
    await stopAndSay('REAPER', say, () => Promise.reject(new Error('bridge gone')));
    expect(say).toHaveBeenCalledWith('REAPER was not asked to stop: bridge gone. Stop it in REAPER.');
  });
  describe('a stop the DAW does not answer', () => {
    afterEach(() => vi.useRealTimers());
    it('is said after PLAY_DEADLINE_MS, with where to stop it, and does not hold the caller back', async () => {
      vi.useFakeTimers();
      const say = vi.fn();
      const done = stopAndSay('REAPER', say, () => new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS - 1);
      expect(say).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(say).toHaveBeenCalledWith('REAPER did not answer in time. Stop it in REAPER.');
    });
    it('says nothing when the stop answers in time', async () => {
      vi.useFakeTimers();
      const say = vi.fn();
      const done = stopAndSay('REAPER', say, () => new Promise((resolve) => setTimeout(() => resolve(null), PLAY_DEADLINE_MS - 1)));
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS);
      await done;
      expect(say).not.toHaveBeenCalled();
    });
  });
});
