import { describe, expect, it } from 'vitest';
import { createDawMock } from './dawMock';

// The mock answers the chapter solo as the host does (bindings_daw_solo.go): the parity rows.
const done = (changed: boolean) => ({ ok: true, changed, message: '', undoSteps: 0 });

describe('the mock DAW, chapter solo', () => {
  it('refuses a chapter with no linked track and puts the chapter before back', async () => {
    const daw = createDawMock({ daw: 'REAPER', connected: true, transport: { playing: false, recording: false } });
    const api = daw;
    const control = daw.control;
    await api.dawSoloChapter('c-0001');
    control.unlinkChapter('c-0002');
    const refused = await api.dawSoloChapter('c-0002');
    expect(refused.ok).toBe(false);
    expect(refused.refused).toContain('no linked track');
    expect(control.soloed().chapterId).toBe('');
  });

  it('can fail a restore, only when a solo is on, and only once', async () => {
    const daw = createDawMock({ daw: 'REAPER', connected: true, transport: { playing: false, recording: false } });
    const api = daw;
    const control = daw.control;
    control.refuseNextRestore('x');
    expect(await api.dawSoloRestore()).toEqual(done(false));
    control.refuseNextRestore('The solo stays.');
    await api.dawSoloChapter('c-0001');
    const failed = await api.dawSoloRestore();
    expect(failed.ok).toBe(false);
    expect(failed.refused).toBe('The solo stays.');
    expect(await api.dawSoloRestore()).toEqual(done(true));
  });

  it('does nothing while the DAW records, and answers done with nothing changed', async () => {
    const daw = createDawMock({ daw: 'REAPER', connected: true, transport: { playing: false, recording: true } });
    expect(await daw.dawSoloChapter('c-0001')).toEqual(done(false));
    expect(daw.control.soloed().chapterId).toBe('');
  });

  it('applies a solo asked during a take once the take stops', async () => {
    const daw = createDawMock({ daw: 'REAPER', connected: true, transport: { playing: false, recording: true } });
    await daw.dawSoloChapter('c-0001');
    expect(daw.control.soloed().chapterId).toBe('');
    daw.control.stopInDaw();
    expect(daw.control.soloed().chapterId).toBe('c-0001');
  });

  it('refuses a restore while the DAW does not answer, when a solo is on', async () => {
    const daw = createDawMock({ daw: 'REAPER', connected: true, transport: { playing: false, recording: false } });
    expect(await daw.dawSoloRestore()).toEqual(done(false));
    await daw.dawSoloChapter('c-0001');
    daw.control.quiet();
    const refused = await daw.dawSoloRestore();
    expect(refused.ok).toBe(false);
    expect(refused.refused).toContain('may stay silent');
    expect(daw.control.soloed().chapterId).toBe('c-0001');
  });
});
