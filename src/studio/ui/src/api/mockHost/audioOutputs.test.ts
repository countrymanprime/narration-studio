// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { listAudioOutputs, setOutput } from '../../components/voicesamples/audioOutputs';
import { installMockAudioOutputs } from './audioOutputs';

afterEach(() => {
  delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
});

describe('the mock audio outputs', () => {
  it('lists two named outputs by default and takes either', async () => {
    installMockAudioOutputs();
    const listing = await listAudioOutputs();
    expect(listing).toMatchObject({ status: 'ok' });
    expect(listing.status === 'ok' && listing.outputs.map((o) => o.label)).toEqual(['Speakers (Realtek)', 'Headphones (Focusrite USB Audio)']);
    expect(await setOutput(document.createElement('audio'), 'Speakers (Realtek)')).toEqual({ ok: true });
  });

  it('none lists nothing named, so the choice is off', async () => {
    installMockAudioOutputs('none');
    expect((await listAudioOutputs()).status).toBe('unavailable');
  });

  it('long lists the long and right-to-left names as written', async () => {
    installMockAudioOutputs('long');
    const listing = await listAudioOutputs();
    expect(listing.status === 'ok' && listing.outputs.map((o) => o.label)).toContain('مكبرات الصوت (USB) 🎧');
  });

  it('refused makes the audio system refuse a named output and accept the system default', async () => {
    installMockAudioOutputs('refused');
    const el = document.createElement('audio');
    expect((await setOutput(el, 'Speakers (Realtek)')).ok).toBe(false);
    expect(await setOutput(el, '')).toEqual({ ok: true });
  });
});
