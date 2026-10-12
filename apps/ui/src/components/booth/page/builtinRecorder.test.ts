import { describe, expect, it, vi } from 'vitest';
import type { RecorderState } from '../../../api/contracts/recording';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import { withBuiltinRecorder } from './builtinRecorder';

const state = (over: Partial<RecorderState> = {}): RecorderState =>
  ({ phase: 'idle', device: 'USB Mic', message: '', engine: 'builtin', ...over }) as RecorderState;
const recorder = (start: Partial<RecorderState> | Error = { phase: 'recording' }) => ({
  recorderState: vi.fn(async () => state()),
  recorderStart: vi.fn(async () => {
    if (start instanceof Error) throw start;
    return { ...state(), ...start } as RecorderState;
  }),
  recorderStop: vi.fn(async () => state()),
});
const project = { chapterIds: ['c1'], candidateIds: [], findingIds: [] };

describe('withBuiltinRecorder', () => {
  it('a setup with no DAW records with the built-in recorder, on the device the project last used', async () => {
    const r = recorder();
    const daw = withBuiltinRecorder(createMockDawClient(DAW_SETUPS.builtin, project), r);
    await expect(daw.recordStart('c1')).resolves.toMatchObject({ ok: true });
    expect(r.recorderStart).toHaveBeenCalledWith('USB Mic');
    await expect(daw.recordStop()).resolves.toMatchObject({ ok: true });
    expect(r.recorderStop).toHaveBeenCalledOnce();
  });

  it("the recorder's refusal is the sentence, and nothing records", async () => {
    const daw = withBuiltinRecorder(createMockDawClient(DAW_SETUPS.builtin, project), recorder(new Error('No microphone found.')));
    await expect(daw.recordStart('c1')).resolves.toMatchObject({ ok: false, refused: 'No microphone found.' });
    const idle = withBuiltinRecorder(createMockDawClient(DAW_SETUPS.builtin, project), recorder({ phase: 'idle', message: 'The device is busy.' }));
    await expect(idle.recordStart('c1')).resolves.toMatchObject({ ok: false, refused: 'The device is busy.' });
  });

  it('a DAW records itself; the recorder is never asked', async () => {
    const r = recorder();
    const daw = withBuiltinRecorder(createMockDawClient(DAW_SETUPS.reaper, project), r);
    await expect(daw.recordStart('c1')).resolves.toMatchObject({ ok: true });
    await daw.recordStop();
    expect(r.recorderStart).not.toHaveBeenCalled();
    expect(r.recorderStop).not.toHaveBeenCalled();
  });
});
