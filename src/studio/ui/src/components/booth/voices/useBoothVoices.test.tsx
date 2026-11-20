// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { WIRE_CHAPTERS } from '../../../api/mockFixtures';
import { VoiceSetupProvider } from '../../engine/voiceLayout';
import { destinationFor } from '../../engine/destination';
import { ChapterTrackStateProvider } from '../../chapterTracks/ChapterTrackState';
import { useBoothVoices, type BoothVoices } from './useBoothVoices';

afterEach(cleanup);

const chapterId = WIRE_CHAPTERS[0].id;

type Extra = {
  coldRead?: boolean;
  stopTake?: () => Promise<boolean>;
  startTake?: () => Promise<unknown>;
  onNoTrack?: (key: number) => void;
  asking?: boolean;
};

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
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={notify}>
          <Probe />
        </ChapterTrackStateProvider>
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
    expect(notify).toHaveBeenCalledWith(destinationFor('flat').noVoiceKeys('none'), 'info');
  });

  // #3271: in a Voice folders project the voice keys never say a chapter records on one track; what they say follows what the chapter is linked to.
  it.each([
    ['a folder the saved project does not hold yet (just made)', [], 'unknown'],
    ['a plain track', [{ guid: '{LINKED}', name: 'Chapter', isFolder: false, depth: 0 }], 'track'],
    ['a folder with no voices', [{ guid: '{LINKED}', name: 'Chapter', isFolder: true, depth: 0 }], 'empty'],
  ] as const)('in a Voice folders project a voice key on a chapter linked to %s says so', async (_what, tracks, kind) => {
    const api = createMockApi({
      voiceTracksGet: async () => ({ layout: 'folders', narratorCharacter: '', narratorGuids: [], notVoiceGuids: [], tracks: [] }),
      chapterTrackMapList: async () => ({
        documentId: 'd',
        mappings: [{ trackGuid: '{LINKED}', chapterId, chapterTitle: 'Chapter', confirmedAt: '', origin: 'manual' as const, match: null }],
      }),
      // The page reads REAPER's live list (#3269), so the stub answers tracksLive.
      tracksLive: async () => ({
        source: 'live' as const,
        reason: '' as const,
        message: '',
        readAt: '2026-11-10T00:00:00Z',
        project: {
          path: 'a.rpp',
          tracks: tracks.map((track, index) => ({ ...track, index, color: '', muted: false, soloed: false, items: [] })),
        },
      }),
    });
    const { notify, hook } = await mount({}, false, api);
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    await act(async () => hook.current.byKey(1));
    expect(hook.current.linkKind).toBe(kind);
    expect(notify).toHaveBeenCalledWith(destinationFor('folders').noVoiceKeys(kind), 'info');
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('records on one track'), 'info');
  });

  it('a voice key with no take running starts the take once the host has accepted the voice; a pick from the list does not (#3430)', async () => {
    const startTake = vi.fn(() => Promise.resolve());
    const { hook } = await mount({ voiceFolders: true }, false, undefined, { startTake });
    await act(async () => hook.current.byKey(1));
    await waitFor(() => expect(startTake).toHaveBeenCalledTimes(1));
    expect(hook.current.current?.name).toBe('White Rabbit');
    await act(async () => hook.current.choose(hook.current.voices[2]));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(startTake).toHaveBeenCalledTimes(1);
  });

  it('a voice key starts nothing when the host refuses the voice, or while a take runs', async () => {
    const startTake = vi.fn(() => Promise.resolve());
    const refused = await mount({ voiceFolders: true }, false, undefined, { startTake });
    refused.api.boothVoiceSet = async () => ({ outcome: 'refused', reason: 'not_a_voice', message: 'No.' });
    await act(async () => refused.hook.current.byKey(1));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(startTake).not.toHaveBeenCalled();
    cleanup();
    const recording = await mount({ voiceFolders: true }, true, undefined, { startTake });
    await act(async () => recording.hook.current.byKey(1));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(startTake).not.toHaveBeenCalled();
  });

  // Owner, 2026-11-16 (#3430): a cold read records nothing and needs no lane, so in Cold read mode the voices make no host call (no lane choice, no arm read).
  describe('in Cold read mode', () => {
    it('a voice key, a pick from the list and Num + / Num - choose nothing at the host, and say why', async () => {
      const startTake = vi.fn(() => Promise.resolve());
      const { api, notify, hook } = await mount({ voiceFolders: true }, false, undefined, { coldRead: true, startTake });
      const set = vi.spyOn(api, 'boothVoiceSet');
      await act(async () => hook.current.byKey(1));
      await act(async () => hook.current.choose(hook.current.voices[2]));
      await act(async () => hook.current.step(1));
      await act(async () => hook.current.step(-1));
      await act(async () => new Promise((r) => setTimeout(r, 20)));
      expect(set).not.toHaveBeenCalled();
      expect(startTake).not.toHaveBeenCalled();
      expect(hook.current.current?.name).toBe('Narrator');
      expect(notify).toHaveBeenCalledWith('A cold read needs no voice. Choose Record to pick one.', 'info');
    });

    it('a chapter with no voices gets the reason alone, not a pointer to Record', async () => {
      const { notify, hook } = await mount({}, false, undefined, { coldRead: true });
      await act(async () => hook.current.byKey(1));
      expect(notify).toHaveBeenCalledWith('A cold read needs no voice.', 'info');
    });

    it('a key with no track does not ask who is in it', async () => {
      const onNoTrack = vi.fn();
      const { hook } = await mount({ voiceFolders: true }, false, undefined, { coldRead: true, onNoTrack });
      await act(async () => hook.current.byKey(7));
      expect(onNoTrack).not.toHaveBeenCalled();
    });

    it('adding a track and putting a character on a voice make no host call', async () => {
      const { api, notify, hook } = await mount({ voiceFolders: true }, false, undefined, { coldRead: true });
      const add = vi.spyOn(api, 'boothVoiceAdd');
      const setCharacters = vi.spyOn(api, 'voiceTracksSetCharacters');
      let added: boolean | undefined;
      let used: boolean | undefined;
      await act(async () => {
        added = await hook.current.add('Alice', []);
        used = await hook.current.use(hook.current.voices[1], ['c1']);
      });
      expect([added, used]).toEqual([false, false]);
      expect(add).not.toHaveBeenCalled();
      expect(setCharacters).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith('A cold read needs no voice. Choose Record to pick one.', 'info');
    });

    it('reads no arm state from the DAW, so the control shows none', async () => {
      const api = createMockApi({}, { voiceFolders: true });
      const read = vi.spyOn(api, 'readAloudReaperState');
      const { hook } = await mount({ voiceFolders: true }, false, api, { coldRead: true });
      await act(async () => new Promise((r) => setTimeout(r, 20)));
      expect(read).not.toHaveBeenCalled();
      expect(hook.current.arm.state).toBe('unknown');
    });

    it('back in Record mode the keys choose and start again', async () => {
      const startTake = vi.fn(() => Promise.resolve());
      const { api, hook } = await mount({ voiceFolders: true }, false, undefined, { coldRead: false, startTake });
      const set = vi.spyOn(api, 'boothVoiceSet');
      await act(async () => hook.current.byKey(1));
      await waitFor(() => expect(startTake).toHaveBeenCalledTimes(1));
      expect(set).toHaveBeenCalledTimes(1);
    });
  });

  it('a refused choice is a toast and keeps the voice', async () => {
    const { api, notify, hook } = await mount({ voiceFolders: true });
    api.boothVoiceSet = async () => ({ outcome: 'refused', reason: 'not_a_voice', message: 'That track is not a voice of this chapter.' });
    await act(async () => hook.current.byKey(1));
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(notify).toHaveBeenCalledWith('That track is not a voice of this chapter.', 'error');
    expect(hook.current.current?.name).toBe('Narrator');
  });

  it("a voice the DAW would not arm is still chosen, and the DAW's refusal is a toast (#3429)", async () => {
    const { api, notify, hook } = await mount({ voiceFolders: true });
    const set = api.boothVoiceSet.bind(api);
    api.boothVoiceSet = async (chapter, guid) => ({
      ...(await set(chapter, guid)),
      armed: undefined,
      reason: 'already_recording',
      message: 'REAPER is already recording. The Booth will record on this voice, but the armed track in REAPER did not change.',
    });
    await act(async () => hook.current.byKey(1));
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('did not change'), 'error');
    expect(hook.current.current?.key).toBe('1');
  });

  it('a voice the DAW armed is chosen with no toast (#3429)', async () => {
    const { api, notify, hook } = await mount({ voiceFolders: true });
    const answers: unknown[] = [];
    const set = api.boothVoiceSet.bind(api);
    api.boothVoiceSet = async (chapter, guid) => {
      const answer = await set(chapter, guid);
      answers.push(answer);
      return answer;
    };
    await act(async () => hook.current.byKey(1));
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(answers).toEqual([expect.objectContaining({ outcome: 'selected', armed: true })]);
    expect(notify).not.toHaveBeenCalledWith(expect.anything(), 'error');
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
    const reads = vi.spyOn(api, 'tracksLive');
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
    const real = api.tracksLive.bind(api);
    let reads = 0;
    api.tracksLive = async () => {
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

  // #3269: the owner's folder of two voices with the layout toggle still Flat. The Booth followed the toggle, the Engine page the folder.
  it("lists the linked folder's voices whatever the layout toggle says", async () => {
    const api = createMockApi({}, { voiceFolders: true });
    await api.voiceTracksSetLayout('flat');
    const { hook } = await mount({}, false, api);
    await waitFor(() => expect(hook.current.voices.length).toBeGreaterThan(0));
    expect(hook.current.voices.some((voice) => voice.name === 'Narrator')).toBe(true);
  });

  // The host's rule (chapterVoicesIn): a track another chapter is linked to is that chapter's own, never a voice of this one, in either layout,
  // so the page must not draw a voice key the host refuses (qa-breaker N3 on #3290: chapter 1 armed chapter 2's track).
  it('leaves out a track another chapter is linked to, under Flat and under Voice folders', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    await api.chapterTrackSet(WIRE_CHAPTERS[1].id, '{V01CE-RABB1T}');
    for (const layout of ['flat', 'folders'] as const) {
      await api.voiceTracksSetLayout(layout);
      const { hook } = await mount({}, false, api);
      await waitFor(() => expect(hook.current.voices.length).toBeGreaterThan(0));
      expect(hook.current.voices.map((voice) => voice.guid)).not.toContain('{V01CE-RABB1T}');
      cleanup();
    }
  });

  // #3331: a child the narrator marked as not a voice (a music bed) is not listed, in either layout, and listed again once unmarked.
  it('leaves out a child marked as not a voice, and lists it again when unmarked', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const first = await mount({}, false, api);
    await waitFor(() => expect(first.hook.current.voices.length).toBeGreaterThan(1));
    const target = first.hook.current.voices.find((voice) => !voice.narrator)!;
    cleanup();
    const marking = (guids: string[]) => ({ ...api, voiceTracksGet: async () => ({ ...(await api.voiceTracksGet()), notVoiceGuids: guids }) });
    for (const layout of ['flat', 'folders'] as const) {
      await api.voiceTracksSetLayout(layout);
      const { hook } = await mount({}, false, marking([target.guid.toLowerCase()]));
      await waitFor(() => expect(hook.current.voices.length).toBeGreaterThan(0));
      expect(hook.current.voices.map((voice) => voice.guid)).not.toContain(target.guid);
      cleanup();
      const again = await mount({}, false, marking([]));
      await waitFor(() => expect(again.hook.current.voices.map((voice) => voice.guid)).toContain(target.guid));
      cleanup();
    }
  });

  // A chapter with no one link has no folder, so it lists no voices and the control names no link. Whether the DAW is read at all belongs to
  // the shared state (a project with no linked DAW file is never read: ChapterTrackStateProvider's `enabled`).
  it('lists no voices for a chapter that is not linked', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    await api.chapterTrackUnlink(chapterId);
    const { hook } = await mount({}, false, api);
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(hook.current.voices).toHaveLength(0);
    expect(hook.current.linkKind).toBe('none');
  });

  // While the shared tracks have not answered (or their read failed) the chapter is not known to be unlinked: the key says the tracks are
  // still being read, and the failed read's toast says why.
  it('a voice key before the tracks are read says they are still being read, not that the chapter is not linked', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.tracksLive = () => new Promise(() => {});
    const onNoTrack = vi.fn();
    const { hook, notify } = await mount({}, false, api, { onNoTrack });
    await act(async () => hook.current.byKey(1));
    const infos = notify.mock.calls.filter((call) => call[1] === 'info').map((call) => String(call[0]));
    expect(infos.join(' ')).toContain('still being read');
    expect(infos.join(' ')).not.toContain('not linked');
  });

  // The poll re-reads every few seconds: a read that keeps failing is one toast, not one per tick.
  it('toasts a run of failed reads once', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.tracksLive = async () => {
      throw new Error('The tracks are locked.');
    };
    const { notify, hook } = await mount({}, false, api);
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(hook.current.voices).toHaveLength(0);
    expect(notify.mock.calls.filter((call) => call[1] === 'error')).toHaveLength(1);
  });

  // The poll re-reads every few seconds: a voice read that keeps failing while the tracks read succeeds is one toast, not one per tick.
  it('toasts a failing voice read once while the tracks read succeeds', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.boothVoiceGet = async () => {
      throw new Error('The host did not answer.');
    };
    const { notify } = await mount({}, false, api);
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    for (let i = 0; i < 3; i++) {
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await act(async () => new Promise((r) => setTimeout(r, 30)));
    }
    expect(notify.mock.calls.filter((call) => call[1] === 'error')).toHaveLength(1);
  });

  // A press of the toast's Retry always answers: when the read fails again, it toasts again.
  it('answers a Retry press with a new toast when the read fails again', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.tracksLive = async () => {
      throw new Error('The tracks are locked.');
    };
    const { notify } = await mount({}, false, api);
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    const first = notify.mock.calls.find((call) => call[1] === 'error')!;
    await act(async () => first[2].onAction());
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(notify.mock.calls.filter((call) => call[1] === 'error')).toHaveLength(2);
  });

  // The poll and the window's focus never start a read over one in flight: a Retry press that started a read is not overtaken and forgotten.
  it('answers a Retry press that a focus event arrives during', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.tracksLive = async () => {
      await new Promise((r) => setTimeout(r, 60));
      throw new Error('The tracks are locked.');
    };
    const { notify } = await mount({}, false, api);
    await act(async () => new Promise((r) => setTimeout(r, 120)));
    const first = notify.mock.calls.find((call) => call[1] === 'error')!;
    await act(async () => first[2].onAction());
    // A focus event while the retried read is still running.
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => new Promise((r) => setTimeout(r, 200)));
    expect(notify.mock.calls.filter((call) => call[1] === 'error')).toHaveLength(2);
  });

  // A read that never answers must not hold every later read back: after the limit it fails with a toast, and the next poll reads again.
  // (It waits the real limit, 10 s.)
  it('tells the narrator when a read never answers, and reads again after it', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const real = api.tracksLive.bind(api);
    let calls = 0;
    api.tracksLive = async () => {
      calls += 1;
      if (calls === 1) return new Promise(() => {});
      return real();
    };
    const { notify, hook } = await mount({}, false, api);
    await act(async () => new Promise((r) => setTimeout(r, 10500)));
    expect(notify.mock.calls.filter((call) => call[1] === 'error')).toHaveLength(1);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(hook.current.voices.length).toBeGreaterThan(0));
    expect(calls).toBeGreaterThan(1);
  }, 20_000);

  // A run where both reads fail reports one failure, not two toasts.
  it('reports one failure for a run where both reads fail', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.tracksLive = async () => {
      throw new Error('The tracks are locked.');
    };
    api.boothVoiceGet = async () => {
      throw new Error('The host did not answer.');
    };
    const { notify } = await mount({}, false, api);
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(notify.mock.calls.filter((call) => call[1] === 'error')).toHaveLength(1);
  });

  // #3269: a voice renamed or deleted in the DAW while the Booth stays open is read again on window focus, so its keys never go stale.
  it('reads the voices again when the window gets focus', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const reads = vi.spyOn(api, 'tracksLive');
    const { hook } = await mount({}, false, api);
    await waitFor(() => expect(hook.current.voices.length).toBeGreaterThan(0));
    const before = reads.mock.calls.length;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThan(before));
  });

  // #3269: a voice renamed in REAPER and not saved is the name the Booth lists (it reads REAPER's live list, as the Engine page does).
  it('lists a voice under the name REAPER has now', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const real = api.tracksLive.bind(api);
    api.tracksLive = async () => {
      const answer = await real();
      return {
        ...answer,
        project: {
          ...answer.project,
          tracks: answer.project.tracks.map((track) => (track.name === 'White Rabbit' ? { ...track, name: 'Rabbit (renamed in REAPER)' } : track)),
        },
      };
    };
    const { hook } = await mount({}, false, api);
    await waitFor(() => expect(hook.current.voices.some((voice) => voice.name === 'Rabbit (renamed in REAPER)')).toBe(true));
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
      let locked = false;
      api.voiceTracksGet = async () => {
        reads += 1;
        if (locked) throw new Error('the setup is locked');
        return real();
      };
      const { notify, hook } = await mount({}, false, api);
      locked = true;
      await act(async () => {
        await hook.current.add('King of Hearts', ['king-of-hearts']);
      });
      const failed = notify.mock.calls.find((call) => String(call[0]).includes('could not be read back'));
      expect(failed?.[2]).toMatchObject({ label: 'Retry' });
      locked = false;
      const before = reads;
      await act(async () => failed![2].onAction());
      expect(reads).toBeGreaterThan(before);
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

// A lane armed in the DAW by hand is the Booth's voice too (#3429, owner answer 4 on #3430).
describe('a lane armed in the DAW', () => {
  const NARRATOR = '{V01CE-N4RRAT0R}';
  const RABBIT = '{V01CE-RABB1T}';
  const EXTRAS = '{V01CE-EXTRAS}';
  const state = (over: Record<string, unknown>) => ({
    status: 'other_armed' as const,
    message: '',
    trackGuid: NARRATOR,
    armedCount: 1,
    armedTrackGuids: [RABBIT],
    playing: false,
    recording: false,
    ...over,
  });
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 15)));
  // A DAW that answers what is armed and, when the Booth chooses a voice, arms it alone (arm_lane), as REAPER does; a refusing host arms nothing.
  const fakeDaw = (api: ReturnType<typeof createMockApi>, initial: ReturnType<typeof state>, refuse = false) => {
    const answer = { current: initial };
    api.readAloudReaperState = async () => answer.current;
    if (refuse) api.boothVoiceSet = async () => ({ outcome: 'refused' as const, reason: 'not_a_voice' as const, message: 'No.' });
    else {
      const choose = api.boothVoiceSet.bind(api);
      api.boothVoiceSet = async (chapter, guid) => {
        const result = await choose(chapter, guid);
        if (result.outcome !== 'refused') answer.current = state({ status: 'ready', trackGuid: guid, armedTrackGuids: [guid] });
        return result;
      };
    }
    return answer;
  };
  const arming = async (extra: Extra = {}, recording = false, refuse = false) => {
    const api = createMockApi({}, { voiceFolders: true });
    const answer = fakeDaw(api, state({}), refuse);
    const set = vi.spyOn(api, 'boothVoiceSet');
    const mounted = await mount({}, recording, api, extra);
    await settle();
    return { ...mounted, api, answer, set };
  };

  it('becomes the Booth voice, once, and does not bounce back', async () => {
    const { hook, answer, set } = await arming();
    expect(set).toHaveBeenCalledExactlyOnceWith(chapterId, RABBIT);
    expect(hook.current.current?.name).toBe('White Rabbit');
    // The DAW now reports the voice the Booth just took as the one armed: nothing more is sent, however often it is read.
    answer.current = state({ status: 'ready', trackGuid: RABBIT, armedTrackGuids: [RABBIT] });
    for (let i = 0; i < 3; i++) {
      await act(async () => hook.current.reload());
      await settle();
    }
    expect(set).toHaveBeenCalledTimes(1);
  });

  // #3645 (the lane switch that "does not switch"): a choice whose arm the DAW did not confirm leaves the old lane armed; that is not the narrator arming it.
  it('does not put the old voice back when the DAW did not confirm the arm of the voice just chosen', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const narrator = (await api.tracksLive()).project.tracks.find((track) => track.name === 'Narrator')?.guid ?? '';
    // The DAW has the Narrator armed alone and stays so: the arm for the new voice never confirms.
    let chosenGuid = '';
    api.readAloudReaperState = async () =>
      chosenGuid === ''
        ? state({ status: 'ready', trackGuid: narrator, armedTrackGuids: [narrator] })
        : state({ status: 'other_armed', trackGuid: chosenGuid, armedTrackGuids: [narrator] });
    const real = api.boothVoiceSet.bind(api);
    api.boothVoiceSet = async (chapter, guid) => ({
      ...(await real(chapter, guid)),
      ...((chosenGuid = guid), {}),
      armed: false,
      reason: 'timeout' as never,
      message: 'REAPER did not confirm in time.',
    });
    const set = vi.spyOn(api, 'boothVoiceSet');
    const { hook } = await mount({}, false, api);
    await settle();
    await act(async () => hook.current.byKey(2));
    await settle();
    for (let i = 0; i < 3; i++) {
      await act(async () => hook.current.reload());
      await settle();
    }
    expect(set).toHaveBeenCalledTimes(1);
    expect(hook.current.current?.name).toBe('Extras');
  });

  it('is followed when the old lane is still armed beside the new one, as a plain arm click leaves it', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const narrator = (await api.tracksLive()).project.tracks.find((track) => track.name === 'Narrator')?.guid ?? '';
    // The Booth's voice is the Narrator, armed; the narrator arms White Rabbit and the Narrator stays armed.
    fakeDaw(api, state({ status: 'several_armed', armedCount: 2, trackGuid: narrator, armedTrackGuids: [narrator, RABBIT] }));
    const set = vi.spyOn(api, 'boothVoiceSet');
    const { hook } = await mount({}, false, api);
    await settle();
    expect(set).toHaveBeenCalledExactlyOnceWith(chapterId, RABBIT);
    expect(hook.current.current?.name).toBe('White Rabbit');
  });

  it('is not followed when two other tracks are armed, since the new lane is then a guess', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.readAloudReaperState = async () => state({ status: 'several_armed', armedCount: 2, armedTrackGuids: [RABBIT, EXTRAS] });
    const set = vi.spyOn(api, 'boothVoiceSet');
    await mount({}, false, api);
    await settle();
    expect(set).not.toHaveBeenCalled();
  });

  it('is asked of the host once while it keeps refusing, not on every read', async () => {
    const { hook, set } = await arming({}, false, true);
    expect(set).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i++) {
      await act(async () => hook.current.reload());
      await settle();
    }
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('is followed again when the narrator arms yet another voice by hand', async () => {
    const { hook, answer, set } = await arming();
    answer.current = state({ status: 'ready', trackGuid: RABBIT, armedTrackGuids: [RABBIT] });
    await act(async () => hook.current.reload());
    await settle();
    answer.current = state({ trackGuid: RABBIT, armedTrackGuids: [EXTRAS] });
    await act(async () => hook.current.reload());
    await settle();
    expect(set).toHaveBeenLastCalledWith(chapterId, EXTRAS);
    expect(hook.current.current?.name).toBe('Extras');
  });

  it("is not followed while this app records, in a cold read, or for a track that is not one of the chapter's voices", async () => {
    const recording = await arming({}, true);
    expect(recording.set).not.toHaveBeenCalled();
    cleanup();
    const cold = await arming({ coldRead: true });
    expect(cold.set).not.toHaveBeenCalled();
    cleanup();
    const api = createMockApi({}, { voiceFolders: true });
    api.readAloudReaperState = async () => state({ armedTrackGuids: ['{SOME-OTHER-TRACK}'] });
    const set = vi.spyOn(api, 'boothVoiceSet');
    await mount({}, false, api);
    await settle();
    expect(set).not.toHaveBeenCalled();
  });

  it('is not followed from no named track, an unreadable DAW or an older script', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const answer = { current: state({ status: 'several_armed', armedCount: 3, armedTrackGuids: undefined }) as ReturnType<typeof state> };
    api.readAloudReaperState = async () => answer.current;
    const set = vi.spyOn(api, 'boothVoiceSet');
    const { hook } = await mount({}, false, api);
    await settle();
    expect(set).not.toHaveBeenCalled();
    api.readAloudReaperState = async () => {
      throw new Error('no answer');
    };
    await act(async () => hook.current.reload());
    await settle();
    expect(set).not.toHaveBeenCalled();
  });

  it("a read begun before the Booth's choice and answered during it does not flip the choice", async () => {
    const api = createMockApi({}, { voiceFolders: true });
    let release: (value: ReturnType<typeof state>) => void = () => undefined;
    let reads = 0;
    api.readAloudReaperState = () => {
      reads += 1;
      if (reads === 1) return new Promise((resolve) => (release = resolve));
      return Promise.reject(new Error('no answer'));
    };
    const set = vi.spyOn(api, 'boothVoiceSet');
    const { hook } = await mount({}, false, api);
    // The first read (the Narrator is the Booth's voice) is still out when the narrator presses Num 2.
    await act(async () => hook.current.byKey(2));
    release(state({ armedTrackGuids: [RABBIT] }));
    await settle();
    await settle();
    expect(set).toHaveBeenCalledExactlyOnceWith(chapterId, EXTRAS);
    expect(hook.current.current?.name).toBe('Extras');
  });

  it('a read begun before a choice of the voice the Booth already has does not flip it', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    // Every read stays out until the test answers it.
    const held: ((value: ReturnType<typeof state>) => void)[] = [];
    api.readAloudReaperState = () => new Promise((resolve) => held.push(resolve));
    const set = vi.spyOn(api, 'boothVoiceSet');
    const { hook } = await mount({}, false, api);
    await settle();
    const narrator = hook.current.current?.guid ?? '';
    const last = held.length - 1;
    // The latest read was begun under the Narrator; the narrator presses Num 0, the voice the Booth already has, and only then does it answer.
    await act(async () => hook.current.byKey(0));
    held[last](state({ trackGuid: narrator, armedTrackGuids: [RABBIT] }));
    await settle();
    await settle();
    expect(set.mock.calls.map((call) => call[1])).toEqual([narrator]);
    expect(hook.current.current?.guid).toBe(narrator);
  });

  it('a read held while the who-is-in dialog is open is not replayed after it picked the current voice', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const answer = fakeDaw(api, state({ armedTrackGuids: [RABBIT] }));
    const set = vi.spyOn(api, 'boothVoiceSet');
    const hook: { current?: BoothVoices } = {};
    const notify = vi.fn();
    function Probe({ asking }: { asking: boolean }) {
      hook.current = useBoothVoices({ chapterId, notify, recording: false, asking });
      return null;
    }
    const tree = (asking: boolean) => (
      <ApiProvider api={api}>
        <VoiceSetupProvider projectFolder="C:/Projects/Alice">
          <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={notify}>
            <Probe asking={asking} />
          </ChapterTrackStateProvider>
        </VoiceSetupProvider>
      </ApiProvider>
    );
    // The dialog is open before any read lands, so the hand-armed Rabbit is held, not followed.
    const view = render(tree(true));
    await settle();
    expect(set).not.toHaveBeenCalled();
    const narrator = hook.current?.voices.find((voice) => voice.narrator);
    expect(narrator).toBeDefined();
    // The narrator answers the dialog with the voice the Booth has; the DAW then arms it alone and the dialog closes.
    answer.current = state({ status: 'ready', trackGuid: narrator?.guid ?? '', armedTrackGuids: [narrator?.guid ?? ''] });
    await act(async () => void hook.current?.use(narrator!, []));
    view.rerender(tree(false));
    await settle();
    await settle();
    expect(set.mock.calls.map((call) => call[1])).toEqual([narrator?.guid]);
  });

  it("is followed when the chapter's folder track is armed beside one voice", async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const tracks = (await api.tracksLive()).project.tracks;
    const folder = tracks.find((track) => track.isFolder)?.guid ?? '';
    fakeDaw(api, state({ status: 'several_armed', armedCount: 2, armedTrackGuids: [folder, RABBIT] }));
    const set = vi.spyOn(api, 'boothVoiceSet');
    await mount({}, false, api);
    await settle();
    expect(set).toHaveBeenCalledExactlyOnceWith(chapterId, RABBIT);
  });

  it('does not swap between two lanes when the DAW keeps both armed', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const narrator = (await api.tracksLive()).project.tracks.find((track) => track.name === 'Narrator')?.guid ?? '';
    api.readAloudReaperState = async () => state({ status: 'several_armed', armedCount: 2, trackGuid: narrator, armedTrackGuids: [narrator, RABBIT] });
    // The host takes the voice but the DAW still reports both lanes armed (it could not disarm the old one).
    const chosen = api.boothVoiceSet.bind(api);
    const set = vi.fn(async (chapter: string, guid: string) => ({ ...(await chosen(chapter, guid)), message: 'Could not arm.' }));
    api.boothVoiceSet = set;
    await mount({}, false, api);
    await settle();
    await settle();
    await settle();
    expect(set.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('a read that landed while the who-is-in dialog was open is not followed when it is cancelled', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const answer = fakeDaw(api, state({ armedTrackGuids: [RABBIT] }));
    const set = vi.spyOn(api, 'boothVoiceSet');
    const notify = vi.fn();
    function Probe({ asking }: { asking: boolean }) {
      useBoothVoices({ chapterId, notify, recording: false, asking });
      return null;
    }
    const tree = (asking: boolean) => (
      <ApiProvider api={api}>
        <VoiceSetupProvider projectFolder="C:/Projects/Alice">
          <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={notify}>
            <Probe asking={asking} />
          </ChapterTrackStateProvider>
        </VoiceSetupProvider>
      </ApiProvider>
    );
    const view = render(tree(true));
    await settle();
    // The DAW goes back to the Narrator alone while the dialog is open, but the next read is still out when the dialog is cancelled.
    answer.current = state({ status: 'ready', armedTrackGuids: [] });
    api.readAloudReaperState = () => new Promise(() => undefined);
    view.rerender(tree(false));
    await settle();
    expect(set).not.toHaveBeenCalled();
  });

  it('follows the same armed set again after a read that failed in between', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const narrator = (await api.tracksLive()).project.tracks.find((track) => track.name === 'Narrator')?.guid ?? '';
    const both = state({ status: 'several_armed', armedCount: 2, trackGuid: narrator, armedTrackGuids: [narrator, RABBIT] });
    // The DAW keeps reporting the set as it is; the host accepts and the Booth takes White Rabbit.
    const dawState = { current: both as ReturnType<typeof state> | 'fail' };
    api.readAloudReaperState = async () => {
      if (dawState.current === 'fail') throw new Error('no answer');
      return dawState.current;
    };
    const set = vi.spyOn(api, 'boothVoiceSet');
    const { hook } = await mount({}, false, api);
    await settle();
    expect(set.mock.calls.map((call) => call[1])).toEqual([RABBIT]);
    // The DAW goes quiet, then reports the Narrator armed beside White Rabbit again: the same set, now a new arm.
    dawState.current = 'fail';
    await act(async () => hook.current.reload());
    await settle();
    dawState.current = both;
    await act(async () => hook.current.reload());
    await settle();
    expect(set.mock.calls.map((call) => call[1])).toEqual([RABBIT, narrator]);
  });

  it('a read taken while this app recorded is not followed when the take stops', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.readAloudReaperState = async () => state({ armedTrackGuids: [RABBIT] });
    const set = vi.spyOn(api, 'boothVoiceSet');
    const hook: { current?: BoothVoices } = {};
    const notify = vi.fn();
    function Probe({ recording }: { recording: boolean }) {
      hook.current = useBoothVoices({ chapterId, notify, recording });
      return null;
    }
    const tree = (recording: boolean) => (
      <ApiProvider api={api}>
        <VoiceSetupProvider projectFolder="C:/Projects/Alice">
          <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={notify}>
            <Probe recording={recording} />
          </ChapterTrackStateProvider>
        </VoiceSetupProvider>
      </ApiProvider>
    );
    const view = render(tree(true));
    await settle();
    api.readAloudReaperState = () => new Promise(() => undefined);
    view.rerender(tree(false));
    await settle();
    expect(set).not.toHaveBeenCalled();
  });
});

// #3645: a read of the host that began before a lane was chosen or added answers for the voice as it was. Landing late, it must neither
// put lane 1 back over the lane the narrator just chose nor drop the lane that was just added.
describe('a late read of the host after a change made here (#3645)', () => {
  function holdNextVoiceRead(api: ReturnType<typeof createMockApi>) {
    const real = api.boothVoiceGet.bind(api);
    let release: () => void = () => {};
    let heldAnswer: Awaited<ReturnType<typeof real>> | undefined;
    let holding = false;
    api.boothVoiceGet = async (id: string) => {
      if (!holding) return real(id);
      holding = false;
      heldAnswer = await real(id);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return heldAnswer;
    };
    return {
      hold: () => {
        holding = true;
      },
      release: () => release(),
    };
  }

  it('does not move the selection back to the old voice when a choice was made while the read was out', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const held = holdNextVoiceRead(api);
    const { hook } = await mount({ voiceFolders: true }, false, api);
    held.hold();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    await act(async () => hook.current.byKey(2));
    await waitFor(() => expect(hook.current.current?.name).toBe('Extras'));
    held.release();
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(hook.current.current?.name).toBe('Extras');
  });

  it('keeps a lane that was just added when a read that began before the add lands after it', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const held = holdNextVoiceRead(api);
    const readBack = api.voiceTracksGet.bind(api);
    let releaseReadBack: () => void = () => {};
    api.voiceTracksGet = async () => {
      await new Promise<void>((resolve) => {
        releaseReadBack = resolve;
      });
      return readBack();
    };
    const { hook } = await mount({ voiceFolders: true }, false, api);
    held.hold();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    let added: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      added = hook.current.add('Queen of Hearts', ['c1']);
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(hook.current.current?.name).toBe('Queen of Hearts'));
    held.release();
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(hook.current.current?.name).toBe('Queen of Hearts');
    releaseReadBack();
    await act(async () => {
      await added;
    });
    expect(hook.current.voices.map((voice) => voice.name)).toContain('Queen of Hearts');
  });
});

describe('a lane that arrives late (#3645)', () => {
  it('is listed but does not take the selection from a voice chosen while the add waited', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    // The host's add is under way (its characters are being saved) while the narrator chooses another voice.
    const realSet = api.voiceTracksSetCharacters.bind(api);
    let release: () => void = () => {};
    api.voiceTracksSetCharacters = async (...args: Parameters<typeof realSet>) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return realSet(...args);
    };
    const { hook } = await mount({ voiceFolders: true }, false, api);
    let added: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      added = hook.current.add('Queen of Hearts', ['c1']);
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => hook.current.byKey(2));
    await waitFor(() => expect(hook.current.current?.name).toBe('Extras'));
    release();
    await act(async () => {
      await added;
    });
    await waitFor(() => expect(hook.current.voices.map((voice) => voice.name)).toContain('Queen of Hearts'));
    expect(hook.current.current?.name).toBe('Extras');
  });
});
