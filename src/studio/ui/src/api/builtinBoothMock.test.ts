import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readAloudRecordingSchema } from './schemas/teleprompter';
import { createMockApi } from './mockApi';
import { readFileSync } from 'node:fs';

const GOLDEN = new URL('../../../../../tests/fixtures/contracts/read-aloud-recordings-builtin.json', import.meta.url);
const golden = z.record(z.string(), readAloudRecordingSchema).parse(JSON.parse(readFileSync(GOLDEN, 'utf8')));
const answer = (name: string) => ({ outcome: golden[name].outcome, reason: golden[name].reason, message: golden[name].message });

// The state matrix of the Booth's Record with the built-in recorder, against the host's own answers (read-aloud-recordings-builtin.json).
const builtin = (recording: object = {}, toggles: object = { record: 'on' }) =>
  createMockApi({}, { daw: { daw: 'Built-in', toggles }, recording: { engine: 'builtin', ...recording } });

describe('the mock Booth Record with the built-in recorder', () => {
  it('starts a take on the last microphone, shows it in the recorder and the transport, and stops it into a take', async () => {
    const api = builtin();
    const takes = (await api.recorderState()).takes.length;
    expect(await api.readAloudRecordStart('chapter-1')).toEqual(golden.start);
    expect((await api.recorderState()).phase).toBe('recording');
    const seen: boolean[] = [];
    api.subscribeDawTransport((transport) => seen.push(transport.recording));
    expect(seen.at(-1)).toBe(true);
    expect((await api.dawProjectState()).playState).toBe('recording');
    // The transport is pushed on the next heartbeat, as the host's is.
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(await api.readAloudRecordStop()).toEqual(golden.stop);
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect((await api.recorderState()).phase).toBe('idle');
    expect((await api.recorderState()).takes).toHaveLength(takes + 1);
    expect(seen.at(-1)).toBe(false);
  });

  it('answers as the host does when a start is refused', async () => {
    const off = await builtin({}, {}).readAloudRecordStart('chapter-1');
    expect({ outcome: off.outcome, reason: off.reason, message: off.message }).toEqual(answer('experimental off'));
    const switchedOff = await builtin({}, { record: 'off' }).readAloudRecordStart('chapter-1');
    expect({ outcome: switchedOff.outcome, reason: switchedOff.reason, message: switchedOff.message }).toEqual(answer('record switched off'));
    const none = await builtin({ devices: 'none', takes: 'none' }).readAloudRecordStart('chapter-1');
    expect(none).toEqual(golden['no microphone']);
    const many = await builtin({ takes: 'none' }).readAloudRecordStart('chapter-1');
    expect(many).toEqual(golden['choose a microphone']);
    const blocked = await builtin({ startFails: true }).readAloudRecordStart('chapter-1');
    expect(blocked).toMatchObject({ outcome: 'refused', reason: 'failed' });
  });

  it('takes the only microphone, and a microphone the Booth chose', async () => {
    const one = builtin({ takes: 'none', deviceNames: ['Only Mic'] });
    expect(await one.readAloudRecordStart('chapter-1')).toEqual(golden.start);
    expect((await one.recorderState()).device).toBe('Only Mic');
    const chosen = builtin({ takes: 'none' });
    await chosen.saveSettings('Teleprompter', 'global', { input_device: 'Analogue 1 + 2 (Focusrite USB Audio)' });
    expect(await chosen.readAloudRecordStart('chapter-1')).toEqual(golden.start);
    expect((await chosen.recorderState()).device).toBe('Analogue 1 + 2 (Focusrite USB Audio)');
  });

  it('refuses a second start, a stop with no take and a punch, like the host', async () => {
    const api = builtin();
    expect(await api.readAloudRecordStop()).toEqual(golden['stop with no take']);
    const punch = await api.readAloudRecordStartAt('chapter-1', 12);
    expect({ outcome: punch.outcome, reason: punch.reason, message: punch.message }).toEqual(answer('punch'));
    await api.readAloudRecordStart('chapter-1');
    expect(await api.readAloudRecordStart('chapter-1')).toMatchObject({ outcome: 'refused' });
  });

  it('leaves a project that records in a DAW to the DAW', async () => {
    const api = createMockApi({}, { daw: { toggles: { record: 'on' } } });
    const started = await api.readAloudRecordStart('chapter-1');
    expect(started.outcome).toBe('started');
    expect((await api.recorderState()).phase).toBe('idle');
  });
});
