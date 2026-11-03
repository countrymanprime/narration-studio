// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { WIRE_CHAPTERS } from '../../../api/mockFixtures';
import { VoiceSetupProvider } from '../../engine/voiceLayout';
import { FLAT_VOICE_KEYS, useBoothVoices, type BoothVoices } from './useBoothVoices';

afterEach(cleanup);

const chapterId = WIRE_CHAPTERS[0].id;

async function mount(seed: Parameters<typeof createMockApi>[1], recording = false, given?: ReturnType<typeof createMockApi>) {
  const api = given ?? createMockApi({}, seed);
  const notify = vi.fn();
  const hook: { current?: BoothVoices } = {};
  function Probe() {
    hook.current = useBoothVoices({ chapterId, recording, notify });
    return null;
  }
  render(
    <ApiProvider api={api}>
      <VoiceSetupProvider projectFolder="C:/Projects/Alice">
        <Probe />
      </VoiceSetupProvider>
    </ApiProvider>,
  );
  for (let i = 0; i < 10 && (hook.current?.voices.length ?? 0) === 0; i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
  return { api, notify, hook: hook as { current: BoothVoices } };
}

describe("the Booth's voices", () => {
  it('a voice folder lists its tracks with their keys and starts on the Narrator voice', async () => {
    const { hook } = await mount({ voiceFolders: true });
    expect(hook.current.voices.map((voice) => [voice.key, voice.name])).toEqual([
      ['0', 'Narrator'],
      ['1', 'White Rabbit'],
      ['2', 'Extras'],
    ]);
    expect(hook.current.current?.name).toBe('Narrator');
  });

  it('a voice key chooses that voice through the host, and the next take records on it', async () => {
    const { api, hook } = await mount({ voiceFolders: true });
    await act(async () => hook.current.byKey(2));
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(hook.current.current?.name).toBe('Extras');
    expect((await api.readAloudRecordStart(chapterId)).trackGuid).toBe('{V01CE-EXTRAS}');
  });

  it("the control shows the host's voice: a choice made before the Booth was left is still the one shown", async () => {
    const first = await mount({ voiceFolders: true });
    await act(async () => first.hook.current.byKey(1));
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    cleanup();
    const again = await mount({}, false, first.api);
    for (let i = 0; i < 10 && again.hook.current.current?.name !== 'White Rabbit'; i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(again.hook.current.current?.name).toBe('White Rabbit');
    expect((await first.api.readAloudRecordStart(chapterId)).trackGuid).toBe('{V01CE-RABB1T}');
  });

  it("a failed read of the host's voice is a toast, and the voices are still listed", async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.boothVoiceGet = async () => {
      throw new Error('The host did not answer.');
    };
    const { notify, hook } = await mount({}, false, api);
    expect(hook.current.voices.map((voice) => voice.name)).toEqual(['Narrator', 'White Rabbit', 'Extras']);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('The host did not answer.'), 'error', expect.objectContaining({ label: 'Retry' }));
  });

  it('a key with no track changes nothing and says which', async () => {
    const { notify, hook } = await mount({ voiceFolders: true });
    await act(async () => hook.current.byKey(7));
    expect(notify).toHaveBeenCalledWith('No track on Num 7.', 'info');
    expect(hook.current.current?.name).toBe('Narrator');
  });

  it('next and previous wrap around the voices in REAPER order', async () => {
    const { hook } = await mount({ voiceFolders: true });
    await act(async () => hook.current.step(-1));
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(hook.current.current?.name).toBe('Extras');
    await act(async () => hook.current.step(1));
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(hook.current.current?.name).toBe('Narrator');
  });

  it('a flat project has no voices, and its voice keys say why they do nothing', async () => {
    const { notify, hook } = await mount({});
    expect(hook.current.voices).toEqual([]);
    await act(async () => hook.current.byKey(1));
    await act(async () => hook.current.step(1));
    expect(notify).toHaveBeenCalledWith(FLAT_VOICE_KEYS, 'info');
  });

  it('a refused choice is a toast and keeps the voice', async () => {
    const { api, notify, hook } = await mount({ voiceFolders: true });
    api.boothVoiceSet = async () => ({ outcome: 'refused', reason: 'not_a_voice', message: 'That track is not a voice of this chapter.' });
    await act(async () => hook.current.byKey(1));
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(notify).toHaveBeenCalledWith('That track is not a voice of this chapter.', 'error');
    expect(hook.current.current?.name).toBe('Narrator');
  });

  it('a second key pressed while the host answers the first is sent after it: the last key wins', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const set = api.boothVoiceSet.bind(api);
    const sent: string[] = [];
    api.boothVoiceSet = async (chapter, guid) => {
      sent.push(guid);
      await new Promise((r) => setTimeout(r, 30));
      return set(chapter, guid);
    };
    const { hook } = await mount({}, true, api);
    await act(async () => hook.current.byKey(1));
    await act(async () => hook.current.byKey(0));
    await act(async () => hook.current.byKey(2));
    await act(async () => new Promise((r) => setTimeout(r, 120)));
    expect(hook.current.current?.name).toBe('Extras');
    // The key between them is dropped, not sent: only the voice the narrator ended on goes after the first.
    expect(sent).toEqual(['{V01CE-RABB1T}', '{V01CE-EXTRAS}']);
  });

  it('Num + pressed twice while the host answers steps twice', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const set = api.boothVoiceSet.bind(api);
    api.boothVoiceSet = async (chapter, guid) => {
      await new Promise((r) => setTimeout(r, 30));
      return set(chapter, guid);
    };
    const { hook } = await mount({}, false, api);
    await act(async () => hook.current.step(1));
    await act(async () => hook.current.step(1));
    await act(async () => new Promise((r) => setTimeout(r, 120)));
    expect(hook.current.current?.name).toBe('Extras');
  });

  it("the arm state is REAPER's report on the voice the host records on", async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const answer = { status: 'ready' as const, message: '', trackGuid: '{V01CE-RABB1T}', armedCount: 1, playing: false, recording: false };
    api.readAloudReaperState = async () => answer;
    const { hook } = await mount({}, false, api);
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    // The Narrator is the voice; REAPER has White Rabbit armed: the Narrator is not armed.
    expect(hook.current.arm.state).toBe('not_armed');
    await act(async () => hook.current.byKey(1));
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(hook.current.arm.state).toBe('armed');
    api.readAloudReaperState = async () => ({ ...answer, status: 'several_armed', armedCount: 3 });
    await act(async () => hook.current.reload());
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(hook.current.arm).toEqual({ state: 'several', count: 3 });
    api.readAloudReaperState = async () => {
      throw new Error('no answer');
    };
    await act(async () => hook.current.reload());
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(hook.current.arm.state).toBe('unknown');
  });

  it('a refusal because the tracks changed reads the voices again', async () => {
    const { api, hook } = await mount({ voiceFolders: true });
    const reads = vi.spyOn(api, 'tracksList');
    api.boothVoiceSet = async () => ({ outcome: 'refused', reason: 'not_a_voice', message: 'That track is not a voice of this chapter.' });
    await act(async () => hook.current.byKey(1));
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(reads).toHaveBeenCalled();
  });

  // Issue #2919: reading the voices changes nothing, so a failed read's toast carries Retry, which reads them again.
  it('Retry on the failed read of the host voice reads the voices again', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const real = api.boothVoiceGet.bind(api);
    let reads = 0;
    api.boothVoiceGet = async (...args: Parameters<typeof real>) => {
      reads += 1;
      if (reads === 1) throw new Error('The host did not answer.');
      return real(...args);
    };
    const { notify } = await mount({}, false, api);
    const failed = notify.mock.calls.find((call) => call[1] === 'error')!;
    await act(async () => failed[2].onAction());
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(reads).toBe(2);
  });

  it('Retry on the failed read of the tracks reads them again', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const real = api.tracksList.bind(api);
    let reads = 0;
    api.tracksList = async () => {
      reads += 1;
      if (reads === 1) throw new Error('The tracks are locked.');
      return real();
    };
    const { notify, hook } = await mount({}, false, api);
    const failed = notify.mock.calls.find((call) => call[1] === 'error')!;
    expect(String(failed[0])).toContain('locked');
    await act(async () => failed[2].onAction());
    for (let i = 0; i < 10 && hook.current.voices.length === 0; i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(reads).toBe(2);
    expect(hook.current.voices.length).toBeGreaterThan(0);
  });
});
