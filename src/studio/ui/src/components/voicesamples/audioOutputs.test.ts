// @vitest-environment jsdom
// The state matrix for choosing where voice samples play (docs/prds/character-voice-samples.prd.md, phase 7, the approved mock's section 4).
//
//   empty (no outputs, or none named)    'no outputs at all, or outputs with no names, is unavailable'
//   one, many                            'lists each named output, not the virtual default or communications ones'
//   system default                       'an empty choice resets the element to the system default'
//   saved device gone                    'a device that is not connected is said so and the element is reset to the default'
//   refused by the audio system          'a refusal from setSinkId is said and the element is reset to the default'
//   not supported (the webview)          'a webview with no setSinkId lists nothing and says so', 'a choice cannot be applied where setSinkId does not exist'
//   listing throws                       'a listing that throws is unavailable, not a crash'
//   long, right-to-left, emoji names     'names are matched as written'
//   two outputs with one name            'two outputs with the same name use the first'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listAudioOutputs, outputsSupported, setOutput } from './audioOutputs';

type Device = { kind: string; deviceId: string; label: string };
const dev = (deviceId: string, label: string, kind = 'audiooutput'): Device => ({ kind, deviceId, label });

let devices: Device[];
let enumerate: ReturnType<typeof vi.fn>;
let setSinkId: ReturnType<typeof vi.fn>;

beforeEach(() => {
  devices = [
    dev('default', 'Default - Speakers'),
    dev('communications', 'Communications - Headset'),
    dev('a1', 'Speakers (Realtek)'),
    dev('b2', 'Headphones (Focusrite USB Audio)'),
    dev('m1', 'Microphone', 'audioinput'),
  ];
  enumerate = vi.fn(async () => devices);
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { enumerateDevices: enumerate } });
  setSinkId = vi.fn(async () => undefined);
  (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId = setSinkId;
});
afterEach(() => {
  delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
  vi.unstubAllGlobals();
});
const audio = () => document.createElement('audio');

describe('listing the outputs', () => {
  it('lists each named output, not the virtual default or communications ones', async () => {
    expect(await listAudioOutputs()).toEqual({
      status: 'ok',
      outputs: [
        { id: 'a1', label: 'Speakers (Realtek)' },
        { id: 'b2', label: 'Headphones (Focusrite USB Audio)' },
      ],
    });
  });

  it('no outputs at all, or outputs with no names, is unavailable', async () => {
    devices = [dev('default', ''), dev('a1', ''), dev('b2', '')];
    expect((await listAudioOutputs()).status).toBe('unavailable');
    devices = [];
    expect((await listAudioOutputs()).status).toBe('unavailable');
  });

  it('a webview with no setSinkId lists nothing and says so', async () => {
    delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
    expect(outputsSupported()).toBe(false);
    expect((await listAudioOutputs()).status).toBe('unavailable');
    expect(enumerate).not.toHaveBeenCalled();
  });

  it('a listing that throws is unavailable, not a crash', async () => {
    enumerate.mockRejectedValueOnce(new Error('NotAllowedError'));
    expect((await listAudioOutputs()).status).toBe('unavailable');
  });
});

describe('applying a choice', () => {
  it('an empty choice resets the element to the system default', async () => {
    expect(await setOutput(audio(), '')).toEqual({ ok: true });
    expect(setSinkId).toHaveBeenCalledWith('');
  });

  it('a named output is found by its name and set by its id', async () => {
    expect(await setOutput(audio(), 'Headphones (Focusrite USB Audio)')).toEqual({ ok: true });
    expect(setSinkId).toHaveBeenCalledWith('b2');
  });

  it('a device that is not connected is said so and the element is reset to the default', async () => {
    const result = await setOutput(audio(), 'Studio monitors (Scarlett)');
    expect(result).toEqual({ ok: false, message: 'Studio monitors (Scarlett) is not connected. Voice samples play on the system default until it is back.' });
    expect(setSinkId).toHaveBeenCalledWith('');
  });

  it('a refusal from setSinkId is said and the element is reset to the default', async () => {
    setSinkId.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
    const result = await setOutput(audio(), 'Speakers (Realtek)');
    expect(result).toEqual({ ok: false, message: 'Could not play on Speakers (Realtek). Choose another output or use the system default.' });
    expect(setSinkId).toHaveBeenLastCalledWith('');
  });

  it('a choice cannot be applied where setSinkId does not exist', async () => {
    delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
    expect((await setOutput(audio(), 'Speakers (Realtek)')).ok).toBe(false);
    expect((await setOutput(audio(), '')).ok).toBe(true);
  });

  it('names are matched as written', async () => {
    devices = [dev('x1', 'مكبرات الصوت (USB Audio Device 🎧)')];
    expect(await setOutput(audio(), 'مكبرات الصوت (USB Audio Device 🎧)')).toEqual({ ok: true });
    expect(setSinkId).toHaveBeenCalledWith('x1');
  });

  it('two outputs with the same name use the first', async () => {
    devices = [dev('first', 'Speakers'), dev('second', 'Speakers')];
    await setOutput(audio(), 'Speakers');
    expect(setSinkId).toHaveBeenCalledWith('first');
  });
});
