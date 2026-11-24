import { describe, expect, it, vi } from 'vitest';
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
});
