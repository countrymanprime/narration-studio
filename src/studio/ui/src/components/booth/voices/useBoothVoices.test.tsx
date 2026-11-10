// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { WIRE_CHAPTERS } from '../../../api/mockFixtures';
import { VoiceSetupProvider } from '../../engine/voiceLayout';
import { destinationFor } from '../../engine/destination';
import { useBoothVoices, type BoothVoices } from './useBoothVoices';

afterEach(cleanup);

const chapterId = WIRE_CHAPTERS[0].id;

type Extra = { stopTake?: () => Promise<boolean>; onNoTrack?: (key: number) => void; asking?: boolean };

async function mount(seed: Parameters<typeof createMockApi>[1], recording = false, given?: ReturnType<typeof createMockApi>, extra: Extra = {}) {
  const api = given ?? createMockApi({}, seed);
  const notify = vi.fn();
  const hook: { current?: BoothVoices } = {};
  const props = { recording, ...extra };
  function Probe() {
    hook.current = useBoothVoices({ chapterId, notify, ...props });
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

  it('a key with no track, while stopped, asks who is in it and changes nothing else', async () => {
    const onNoTrack = vi.fn();
    const stopTake = vi.fn(async () => true);
    const { notify, hook } = await mount({ voiceFolders: true }, false, undefined, { onNoTrack, stopTake });
    await act(async () => hook.current.byKey(7));
    expect(onNoTrack).toHaveBeenCalledWith(7);
    expect(stopTake).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
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
    expect(notify).toHaveBeenCalledWith(destinationFor('flat').noVoiceKeys(false), 'info');
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

  describe('a key with no track during a take (#2839): stop first, then ask', () => {
    // A stop the test answers when it chooses, as the DAW does some time after the press.
    function heldStop() {
      let answer: (stopped: boolean) => void = () => undefined;
      const stopTake = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)));
      return { stopTake, answer: (stopped: boolean) => answer(stopped) };
    }

    it('stops the take, and asks only once it has stopped', async () => {
      const { stopTake, answer } = heldStop();
      const onNoTrack = vi.fn();
      const { hook } = await mount({ voiceFolders: true }, true, undefined, { stopTake, onNoTrack });
      await act(async () => hook.current.byKey(7));
      expect(stopTake).toHaveBeenCalledTimes(1);
      expect(hook.current.stopping).toBe(true);
      expect(onNoTrack).not.toHaveBeenCalled();
      await act(async () => answer(true));
      expect(onNoTrack).toHaveBeenCalledExactlyOnceWith(7);
      expect(hook.current.stopping).toBe(false);
    });

    it('a held key that repeats while the stop is answered stops once and asks once', async () => {
      const { stopTake, answer } = heldStop();
      const onNoTrack = vi.fn();
      const { hook } = await mount({ voiceFolders: true }, true, undefined, { stopTake, onNoTrack });
      await act(async () => {
        for (let i = 0; i < 12; i++) hook.current.byKey(7);
      });
      await act(async () => answer(true));
      expect(stopTake).toHaveBeenCalledTimes(1);
      expect(onNoTrack).toHaveBeenCalledExactlyOnceWith(7);
    });

    it('a second key while the stop is answered is the one acted on: a key with a track chooses it and asks nothing', async () => {
      const { stopTake, answer } = heldStop();
      const onNoTrack = vi.fn();
      const { hook } = await mount({ voiceFolders: true }, true, undefined, { stopTake, onNoTrack });
      await act(async () => hook.current.byKey(7));
      await act(async () => hook.current.byKey(1));
      await act(async () => answer(true));
      await act(async () => new Promise((r) => setTimeout(r, 5)));
      expect(onNoTrack).not.toHaveBeenCalled();
      expect(hook.current.current?.name).toBe('White Rabbit');
    });

    it('a second key with no track while the stop is answered asks for that key', async () => {
      const { stopTake, answer } = heldStop();
      const onNoTrack = vi.fn();
      const { hook } = await mount({ voiceFolders: true }, true, undefined, { stopTake, onNoTrack });
      await act(async () => hook.current.byKey(7));
      await act(async () => hook.current.byKey(5));
      await act(async () => answer(true));
      expect(onNoTrack).toHaveBeenCalledExactlyOnceWith(5);
    });

    it('Num + and Num − while the stop is answered switch nothing', async () => {
      const { stopTake, answer } = heldStop();
      const { api, hook } = await mount({ voiceFolders: true }, true, undefined, { stopTake, onNoTrack: vi.fn() });
      const set = vi.spyOn(api, 'boothVoiceSet');
      await act(async () => hook.current.byKey(7));
      await act(async () => hook.current.step(1));
      await act(async () => answer(true));
      expect(set).not.toHaveBeenCalled();
    });

    it('a stop that does not go through asks nothing, and the take goes on', async () => {
      const { stopTake, answer } = heldStop();
      const onNoTrack = vi.fn();
      const { hook } = await mount({ voiceFolders: true }, true, undefined, { stopTake, onNoTrack });
      await act(async () => hook.current.byKey(7));
      await act(async () => answer(false));
      expect(onNoTrack).not.toHaveBeenCalled();
      expect(hook.current.stopping).toBe(false);
      // The next press tries again.
      await act(async () => hook.current.byKey(7));
      expect(stopTake).toHaveBeenCalledTimes(2);
    });

    it('a stop that fails outright asks nothing and lets the next press try again', async () => {
      const stopTake = vi.fn(async () => {
        throw new Error('the host went away');
      });
      const onNoTrack = vi.fn();
      const { hook } = await mount({ voiceFolders: true }, true, undefined, { stopTake, onNoTrack });
      await act(async () => hook.current.byKey(7));
      await act(async () => new Promise((r) => setTimeout(r, 5)));
      expect(onNoTrack).not.toHaveBeenCalled();
      expect(hook.current.stopping).toBe(false);
    });

    it('while "Who is in Num N?" is open a key neither stops, asks nor switches', async () => {
      const stopTake = vi.fn(async () => true);
      const onNoTrack = vi.fn();
      const { api, hook } = await mount({ voiceFolders: true }, true, undefined, { stopTake, onNoTrack, asking: true });
      const set = vi.spyOn(api, 'boothVoiceSet');
      await act(async () => {
        hook.current.byKey(7);
        hook.current.byKey(1);
      });
      expect(stopTake).not.toHaveBeenCalled();
      expect(onNoTrack).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    });

    it('a key with a track during a take still switches the take live, with no stop', async () => {
      const stopTake = vi.fn(async () => true);
      const { hook } = await mount({ voiceFolders: true }, true, undefined, { stopTake, onNoTrack: vi.fn() });
      await act(async () => hook.current.byKey(2));
      await act(async () => new Promise((r) => setTimeout(r, 5)));
      expect(stopTake).not.toHaveBeenCalled();
      expect(hook.current.current?.name).toBe('Extras');
    });
  });

  describe('adding and using tracks', () => {
    // Issue #2919: reading the setup back changes nothing, so the failed read-back's toast carries Retry, which reads it again.
    it('a failed read-back after adding a track offers Retry, which reads the setup again', async () => {
      const api = createMockApi({}, { voiceFolders: true });
      const real = api.voiceTracksGet.bind(api);
      let reads = 0;
      api.voiceTracksGet = async () => {
        reads += 1;
        if (reads === 2) throw new Error('the setup is locked');
        return real();
      };
      const { notify, hook } = await mount({}, false, api);
      await act(async () => {
        await hook.current.add('King of Hearts', ['king-of-hearts']);
      });
      const failed = notify.mock.calls.find((call) => String(call[0]).includes('could not be read back'));
      expect(failed?.[2]).toMatchObject({ label: 'Retry' });
      await act(async () => failed![2].onAction());
      expect(reads).toBe(3);
    });

    it('an added track is listed at once with the next free key, chosen, and its characters on it', async () => {
      const { api, hook } = await mount({ voiceFolders: true });
      let ok = false;
      await act(async () => {
        ok = await hook.current.add('King of Hearts', ['king-of-hearts']);
      });
      for (let i = 0; i < 10 && hook.current.voices.length < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
      expect(ok).toBe(true);
      expect(hook.current.voices.map((voice) => [voice.key, voice.name])).toEqual([
        ['0', 'Narrator'],
        ['1', 'White Rabbit'],
        ['2', 'Extras'],
        ['3', 'King of Hearts'],
      ]);
      expect(hook.current.current?.name).toBe('King of Hearts');
      expect(hook.current.voices[3].characters.map((character) => character.id)).toEqual(['king-of-hearts']);
      expect((await api.readAloudRecordStart(chapterId)).trackGuid).toBe(hook.current.voices[3].guid);
    });

    it('a refused add is an error toast and answers false; nothing is listed', async () => {
      const { notify, hook } = await mount({ voiceFolders: true });
      let ok = true;
      await act(async () => {
        ok = await hook.current.add('Extras', []);
      });
      expect(ok).toBe(false);
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('already has a track named'), 'error');
      expect(hook.current.voices).toHaveLength(3);
    });

    it('using an existing track adds the characters to the ones it had and chooses it', async () => {
      const { api, hook } = await mount({ voiceFolders: true });
      await act(async () => {
        await hook.current.use(hook.current.voices[2], ['king-of-hearts']);
      });
      await act(async () => new Promise((r) => setTimeout(r, 5)));
      expect((await api.voiceTracksGet()).tracks.find((entry) => entry.track === 'Extras')?.characters).toEqual([
        'mad-hatter',
        'cheshire-cat',
        'king-of-hearts',
      ]);
      expect(hook.current.current?.name).toBe('Extras');
    });

    it('a new track named for a character keeps that character when others are ticked', async () => {
      const { api, hook } = await mount({ voiceFolders: true });
      await act(async () => {
        await hook.current.add('Alice', ['mad-hatter']);
      });
      expect((await api.voiceTracksGet()).tracks.find((entry) => entry.track === 'Alice')?.characters).toEqual(['alice', 'mad-hatter']);
    });

    it('using a track matched by name keeps the character its name matched (White Rabbit stays on Num 1)', async () => {
      const { api, hook } = await mount({ voiceFolders: true });
      await act(async () => {
        await hook.current.use(hook.current.voices[1], ['alice']);
      });
      await act(async () => new Promise((r) => setTimeout(r, 5)));
      expect((await api.voiceTracksGet()).tracks.find((entry) => entry.track === 'White Rabbit')?.characters).toEqual(['white-rabbit', 'alice']);
      expect(hook.current.voices[1].characters.map((character) => character.id)).toEqual(['white-rabbit', 'alice']);
    });

    it('a character with no track chosen during a take records on the Narrator voice and says so until another voice is chosen', async () => {
      const { hook } = await mount({ voiceFolders: true }, true);
      await act(async () => hook.current.byKey(1));
      await act(async () => new Promise((r) => setTimeout(r, 5)));
      await act(async () => hook.current.standInFor({ id: 'king-of-hearts', name: 'King of Hearts', lines: 12 }));
      await act(async () => new Promise((r) => setTimeout(r, 5)));
      expect(hook.current.current?.name).toBe('Narrator');
      expect(hook.current.standIn?.name).toBe('King of Hearts');
      await act(async () => hook.current.byKey(2));
      expect(hook.current.standIn).toBeUndefined();
    });
  });
});
