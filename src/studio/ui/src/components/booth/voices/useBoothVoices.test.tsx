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
      voiceTracksGet: async () => ({ layout: 'folders', narratorCharacter: '', narratorGuids: [], tracks: [] }),
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
  // (It waits the real limit, 8 s.)
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
    await act(async () => new Promise((r) => setTimeout(r, 8500)));
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
