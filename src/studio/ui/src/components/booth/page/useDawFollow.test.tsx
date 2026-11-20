// @vitest-environment jsdom
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawPlace } from '../../../api/contracts/daw';
import type { ScopedSettingField } from '../../../api/contracts/system';
import { createDawMock } from '../../../api/dawMock';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { useFollowChapterInDaw } from '../../../hooks/useDawGoesToChapter';
import { forgetBoothMonitorAsked, useArmBoothOnOpen, useFollowDawOnOpen, useMoveDawOnOpen, useReleaseBoothMonitorOnLeave } from './useDawFollow';
import { useDawPullBack } from '../../../hooks/useDawPullBack';

afterEach(() => {
  forgetBoothMonitorAsked();
  cleanup();
  vi.useRealTimers();
});

const answer = (over: Partial<DawPlace> = {}): DawPlace => ({ ok: true, message: '', chapterId: '', selected: 0, cursor: 0, ...over });
const refusal = answer({ ok: false, message: 'REAPER is not answering.' });
const moved = { ok: true, changed: true, message: '', undoSteps: 0 };

function wrapperFor(overrides: Partial<NarrationApi>) {
  const api = createMockApi(overrides);
  return ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
}

describe('useFollowDawOnOpen', () => {
  const chapterIds = ['c-1', 'c-2'];

  it('opens on the chapter whose track the narrator is on', async () => {
    const onChapter = vi.fn();
    const dawPlace = vi.fn(async () => answer({ chapterId: 'c-2', selected: 1, cursor: 30 }));
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    await waitFor(() => expect(onChapter).toHaveBeenCalledExactlyOnceWith('c-2'));
    expect(dawPlace).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no track selected', answer()],
    ['a track no chapter is linked to', answer({ selected: 1 })],
    ['a chapter the manuscript does not have', answer({ chapterId: 'c-9', selected: 1 })],
  ])('leaves the Booth where it opens for %s, and asks only once', async (_name, place) => {
    const onChapter = vi.fn();
    const dawPlace = vi.fn(async () => place);
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    await waitFor(() => expect(dawPlace).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(onChapter).not.toHaveBeenCalled();
    expect(dawPlace).toHaveBeenCalledTimes(1);
  });

  it('asks nothing while the address or the narrator has chosen a chapter, or the chapters are not read', async () => {
    const dawPlace = vi.fn(async () => answer({ chapterId: 'c-2' }));
    const onChapter = vi.fn();
    renderHook(() => useFollowDawOnOpen({ enabled: false, chapterIds, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds: undefined, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds: [], onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    await act(async () => {});
    expect(dawPlace).not.toHaveBeenCalled();
  });

  it('asks again while the DAW has not answered, then follows it once it does', async () => {
    vi.useFakeTimers();
    const onChapter = vi.fn();
    let calls = 0;
    const dawPlace = vi.fn(async () => (++calls < 3 ? refusal : answer({ chapterId: 'c-1', selected: 1 })));
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    await act(async () => {});
    expect(onChapter).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(onChapter).toHaveBeenCalledExactlyOnceWith('c-1');
    expect(dawPlace).toHaveBeenCalledTimes(3);
  });

  it('gives up silently when the DAW never answers, and treats a failed read as no answer', async () => {
    vi.useFakeTimers();
    const onChapter = vi.fn();
    const dawPlace = vi.fn(async () => {
      throw new Error('boom');
    });
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));
    expect(onChapter).not.toHaveBeenCalled();
    const calls = dawPlace.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(12);
  });

  it('stops asking once the narrator or the address chooses a chapter', async () => {
    vi.useFakeTimers();
    const dawPlace = vi.fn(async () => refusal);
    const onChapter = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useFollowDawOnOpen({ enabled, chapterIds, onChapter }), {
      initialProps: { enabled: true },
      wrapper: wrapperFor({ dawPlace }),
    });
    await act(async () => {});
    rerender({ enabled: false });
    const before = dawPlace.mock.calls.length;
    await act(async () => void (await vi.advanceTimersByTimeAsync(10_000)));
    expect(dawPlace).toHaveBeenCalledTimes(before);
  });
});

describe('useMoveDawOnOpen', () => {
  const base = { enabled: true, follow: true, chapterId: 'c-1', canFollow: true, target: { where: 'end' } as const };

  it('moves the DAW to the end of the chapter, once', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    const say = vi.fn();
    const { rerender } = renderHook((props) => useMoveDawOnOpen({ ...props, say }), { initialProps: base, wrapper: wrapperFor({ dawGoToChapter }) });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledExactlyOnceWith('c-1', 'end', 0));
    rerender({ ...base, target: { where: 'end' } });
    await act(async () => {});
    expect(dawGoToChapter).toHaveBeenCalledTimes(1);
    expect(say).not.toHaveBeenCalled();
  });

  it('moves the DAW to the line the Booth opened at', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    renderHook(() => useMoveDawOnOpen({ ...base, target: { where: 'at', seconds: 41.5 }, say: vi.fn() }), { wrapper: wrapperFor({ dawGoToChapter }) });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledExactlyOnceWith('c-1', 'at', 41.5));
  });

  it('waits for the line to be known and for the DAW to be able to follow', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useMoveDawOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, canFollow: false, target: null as { where: 'end' } | null },
      wrapper: wrapperFor({ dawGoToChapter }),
    });
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
    rerender({ ...base, canFollow: false, target: { where: 'end' } });
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
    rerender({ ...base, canFollow: true, target: { where: 'end' } });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledTimes(1));
  });

  it('moves nothing for a Booth that followed the DAW, or one with no chapter', async () => {
    const dawGoToChapter = vi.fn();
    renderHook(() => useMoveDawOnOpen({ ...base, enabled: false, say: vi.fn() }), { wrapper: wrapperFor({ dawGoToChapter }) });
    renderHook(() => useMoveDawOnOpen({ ...base, chapterId: '', say: vi.fn() }), { wrapper: wrapperFor({ dawGoToChapter }) });
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('says a refusal and a failed call', async () => {
    const refused = vi.fn(async () => ({ ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'The track is gone.' }));
    const say = vi.fn();
    renderHook(() => useMoveDawOnOpen({ ...base, say }), { wrapper: wrapperFor({ dawGoToChapter: refused }) });
    await waitFor(() => expect(say).toHaveBeenCalledExactlyOnceWith('The track is gone.'));

    const failing = vi.fn(async () => {
      throw new Error('bridge down');
    });
    const sayFailure = vi.fn();
    renderHook(() => useMoveDawOnOpen({ ...base, say: sayFailure }), { wrapper: wrapperFor({ dawGoToChapter: failing }) });
    await waitFor(() => expect(sayFailure).toHaveBeenCalledTimes(1));
  });
});

describe('Booth.follow_chapter_in_daw (#3427)', () => {
  const base = { enabled: true, chapterId: 'c-1', canFollow: true, target: { where: 'end' } as const };

  it('moves nothing while the setting is off or not read yet, and moves once it is on', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useMoveDawOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, follow: false as boolean | undefined },
      wrapper: wrapperFor({ dawGoToChapter }),
    });
    await act(async () => {});
    rerender({ ...base, follow: undefined });
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
    rerender({ ...base, follow: true });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledExactlyOnceWith('c-1', 'end', 0));
  });

  const fieldsWith = (effectiveValue: string): Record<string, ScopedSettingField[]> => ({
    Booth: [
      {
        key: 'follow_chapter_in_daw',
        label: 'x',
        kind: 'bool',
        choices: [],
        value: effectiveValue,
        isSet: true,
        effectiveValue,
        effectiveSource: 'repo default',
      },
    ],
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads the setting %s from the global scope', async (value, expected) => {
    const settingsForScope = vi.fn(async () => fieldsWith(value));
    const { result } = renderHook(() => useFollowChapterInDaw(), { wrapper: wrapperFor({ settingsForScope }) });
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(expected));
    expect(settingsForScope).toHaveBeenCalledWith('global');
  });

  it('is on when the setting is missing or cannot be read, the default', async () => {
    const missing = renderHook(() => useFollowChapterInDaw(), {
      wrapper: wrapperFor({ settingsForScope: vi.fn(async (): Promise<Record<string, ScopedSettingField[]>> => ({})) }),
    });
    await waitFor(() => expect(missing.result.current).toBe(true));
    const failing = renderHook(() => useFollowChapterInDaw(), {
      wrapper: wrapperFor({
        settingsForScope: vi.fn(async () => {
          throw new Error('host down');
        }),
      }),
    });
    await waitFor(() => expect(failing.result.current).toBe(true));
  });
});

describe('arming the Booth voice on entry (#3428)', () => {
  const base = { enabled: true, follow: true as boolean | undefined, chapterId: 'c-1', canArm: true };

  it('arms the chapter once, when the DAW can arm and the switch is on', async () => {
    const dawArmBoothVoice = vi.fn(async () => moved);
    const say = vi.fn();
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say }), { initialProps: base, wrapper: wrapperFor({ dawArmBoothVoice }) });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledExactlyOnceWith('c-1'));
    rerender({ ...base });
    await act(async () => {});
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(1);
    expect(say).not.toHaveBeenCalled();
  });

  // #3670: the chapter's track was just created or linked, so the arm is owed now, and it pays what an earlier refusal owed.
  it('armNow arms the chapter once more, and a refusal the link then satisfies owes nothing at the next stop or reconnect', async () => {
    const dawArmBoothVoice = vi
      .fn<(chapterId: string) => Promise<typeof moved & { ok: boolean; refused?: string }>>()
      .mockResolvedValueOnce({ ...moved, ok: false, message: 'No track is linked.', refused: 'No track is linked.' })
      .mockResolvedValue(moved);
    const say = vi.fn();
    const props = { ...base, canArm: true, recording: false };
    const { result, rerender } = renderHook((p) => useArmBoothOnOpen({ ...p, say }), { initialProps: props, wrapper: wrapperFor({ dawArmBoothVoice }) });
    await waitFor(() => expect(say).toHaveBeenCalledTimes(1));
    await act(async () => result.current());
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledTimes(2));
    rerender({ ...props, recording: true });
    rerender({ ...props, recording: false });
    rerender({ ...props, canArm: false });
    rerender({ ...props, canArm: true });
    await act(async () => {});
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(2);
    expect(say).toHaveBeenCalledTimes(1);
  });

  // #3670: only the Booth, open on the chapter and with "DAW follows your chapter" on, arms a track that was just created or linked.
  it('armNow arms nothing with the switch off', async () => {
    const dawArmBoothVoice = vi.fn(async () => moved);
    const { result } = renderHook((p) => useArmBoothOnOpen({ ...p, say: vi.fn() }), {
      initialProps: { ...base, follow: false as boolean | undefined },
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    await act(async () => result.current());
    await act(async () => {});
    expect(dawArmBoothVoice).not.toHaveBeenCalled();
  });

  it('armNow says nothing for an older ask that is refused after the newer one answered ok', async () => {
    let releaseFirst: (value: typeof moved & { ok: boolean; refused?: string }) => void = () => {};
    const dawArmBoothVoice = vi
      .fn<(chapterId: string) => Promise<typeof moved & { ok: boolean; refused?: string }>>()
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockResolvedValue(moved);
    const say = vi.fn();
    const { result } = renderHook((p) => useArmBoothOnOpen({ ...p, say }), { initialProps: base, wrapper: wrapperFor({ dawArmBoothVoice }) });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledTimes(1));
    await act(async () => result.current());
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledTimes(2));
    await act(async () => releaseFirst({ ...moved, ok: false, message: 'Late refusal.', refused: 'Late refusal.' }));
    expect(say).not.toHaveBeenCalled();
  });

  it('asks nothing while the switch is off or unread, the DAW cannot arm, a cold read runs or there is no chapter, and asks once each allows it', async () => {
    const dawArmBoothVoice = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, follow: false as boolean | undefined },
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    rerender({ ...base, follow: undefined });
    rerender({ ...base, canArm: false });
    rerender({ ...base, enabled: false });
    rerender({ ...base, chapterId: '' });
    await act(async () => {});
    expect(dawArmBoothVoice).not.toHaveBeenCalled();
    rerender({ ...base });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledExactlyOnceWith('c-1'));
  });

  it('arms a DAW that connects late, once, however long after the Booth opened', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const dawArmBoothVoice = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, canArm: false },
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    vi.setSystemTime(Date.now() + 3_600_000);
    rerender({ ...base, canArm: true });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledExactlyOnceWith('c-1'));
    rerender({ ...base, canArm: true });
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(1);
  });

  it('arms once a cold read ends however long it ran', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const dawArmBoothVoice = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, enabled: false },
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    vi.setSystemTime(Date.now() + 120_000);
    await act(async () => {});
    expect(dawArmBoothVoice).not.toHaveBeenCalled();
    rerender({ ...base, enabled: true });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledExactlyOnceWith('c-1'));
  });

  it('arms once a setting that was read late turns out to be on', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const dawArmBoothVoice = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, follow: undefined as boolean | undefined },
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    vi.setSystemTime(Date.now() + 60_000);
    rerender({ ...base, follow: true });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledExactlyOnceWith('c-1'));
  });

  it.each([true, false])(
    'arms the voice chosen during a take once the take stops, with the switch %s, and nothing for a take with no voice change',
    async (follow) => {
      const dawArmBoothVoice = vi.fn(async () => moved);
      const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
        initialProps: { ...base, follow: follow as boolean | undefined, recording: false, voice: 'v1' },
        wrapper: wrapperFor({ dawArmBoothVoice }),
      });
      await act(async () => {});
      const entry = follow ? 1 : 0;
      expect(dawArmBoothVoice).toHaveBeenCalledTimes(entry);
      // A take with no voice change owes nothing.
      rerender({ ...base, follow, recording: true, voice: 'v1' });
      rerender({ ...base, follow, recording: false, voice: 'v1' });
      await act(async () => {});
      expect(dawArmBoothVoice).toHaveBeenCalledTimes(entry);
      // A voice chosen during the take: armed once it stops, exactly once.
      rerender({ ...base, follow, recording: true, voice: 'v1' });
      rerender({ ...base, follow, recording: true, voice: 'v2' });
      await act(async () => {});
      expect(dawArmBoothVoice).toHaveBeenCalledTimes(entry);
      rerender({ ...base, follow, recording: false, voice: 'v2' });
      await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledTimes(entry + 1));
      rerender({ ...base, follow, recording: false, voice: 'v2' });
      await act(async () => {});
      expect(dawArmBoothVoice).toHaveBeenCalledTimes(entry + 1);
    },
  );

  it('a voice chosen during a take is armed after the stop even with the setting off', async () => {
    const dawArmBoothVoice = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, follow: false as boolean | undefined, recording: false, voice: 'v1' },
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    rerender({ ...base, follow: false, recording: true, voice: 'v1' });
    rerender({ ...base, follow: false, recording: true, voice: 'v2' });
    rerender({ ...base, follow: false, recording: false, voice: 'v2' });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledExactlyOnceWith('c-1'));
  });

  it.each([true, false])(
    're-entering during a take sends the call that cancels a waiting release, with the switch %s, and arms once the take stops',
    async (follow) => {
      const dawArmBoothVoice = vi.fn(async () => moved);
      const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
        initialProps: { ...base, follow, recording: true, voice: 'v1' },
        wrapper: wrapperFor({ dawArmBoothVoice }),
      });
      await act(async () => {});
      expect(dawArmBoothVoice).toHaveBeenCalledTimes(follow ? 1 : 0);
      rerender({ ...base, follow, recording: false, voice: 'v1' });
      await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledTimes(follow ? 2 : 0));
    },
  );

  it('a refused arm is sent again when the take stops, with no timer, and each refusal is said once', async () => {
    vi.useFakeTimers();
    const refused = { ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'REAPER is already recording.' };
    const dawArmBoothVoice = vi.fn().mockResolvedValueOnce(refused).mockResolvedValueOnce(refused).mockResolvedValue(moved);
    const say = vi.fn();
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say }), {
      initialProps: { ...base, recording: true },
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    await act(async () => {});
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(1);
    rerender({ ...base, recording: false });
    await act(async () => {});
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(2);
    expect(say).toHaveBeenCalledTimes(2);
    rerender({ ...base, recording: true });
    rerender({ ...base, recording: false });
    await act(async () => {});
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(3);
  });

  it('a refused arm is sent again when the DAW reconnects', async () => {
    const refused = { ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'REAPER is not answering.' };
    const dawArmBoothVoice = vi.fn().mockResolvedValueOnce(refused).mockResolvedValue(moved);
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
      initialProps: base,
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    await act(async () => {});
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(1);
    rerender({ ...base, canArm: false });
    rerender({ ...base, canArm: true });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledTimes(2));
  });

  it('says nothing and sets nothing when the answer arrives after the Booth was left', async () => {
    let answer: (value: typeof moved) => void = () => undefined;
    const dawArmBoothVoice = vi.fn(() => new Promise<typeof moved>((resolve) => (answer = resolve)));
    const say = vi.fn();
    const { unmount } = renderHook(() => useArmBoothOnOpen({ ...base, say }), { wrapper: wrapperFor({ dawArmBoothVoice }) });
    await act(async () => {});
    unmount();
    await act(async () => answer({ ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'late' } as unknown as typeof moved));
    expect(say).not.toHaveBeenCalled();
  });

  it('says a refusal and a failed call, and changes nothing else', async () => {
    const refused = vi.fn(async () => ({ ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'REAPER is already recording.' }));
    const say = vi.fn();
    renderHook(() => useArmBoothOnOpen({ ...base, say }), { wrapper: wrapperFor({ dawArmBoothVoice: refused }) });
    await waitFor(() => expect(say).toHaveBeenCalledExactlyOnceWith('REAPER is already recording.'));
    const failing = vi.fn(async () => {
      throw new Error('bridge down');
    });
    const sayFailure = vi.fn();
    renderHook(() => useArmBoothOnOpen({ ...base, say: sayFailure }), { wrapper: wrapperFor({ dawArmBoothVoice: failing }) });
    await waitFor(() => expect(sayFailure).toHaveBeenCalledTimes(1));
  });

  // StrictMode mounts, unmounts and mounts again: the hook is still on screen, so its refusal and its failure are said (they were silent).
  // A component, not renderHook: renderHook under the provider does not run the effects twice.
  function renderStrict(dawArmBoothVoice: NonNullable<NarrationApi['dawArmBoothVoice']>, say: (sentence: string) => void) {
    function Arm() {
      useArmBoothOnOpen({ ...base, say });
      return null;
    }
    const Wrapper = wrapperFor({ dawArmBoothVoice });
    return render(
      <StrictMode>
        <Wrapper>
          <Arm />
        </Wrapper>
      </StrictMode>,
    );
  }
  // The DAW answers after the remount, as a bridge round trip does.
  const later = () => new Promise((r) => setTimeout(r, 20));

  it('says a refusal under StrictMode too', async () => {
    const refused = vi.fn(async () => {
      await later();
      return { ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'REAPER is already recording.' };
    });
    const say = vi.fn();
    renderStrict(refused, say);
    await waitFor(() => expect(say).toHaveBeenCalledExactlyOnceWith('REAPER is already recording.'));
  });

  it('says a failed call under StrictMode too', async () => {
    const failing = vi.fn(async () => {
      await later();
      throw new Error('bridge down');
    });
    const say = vi.fn();
    renderStrict(failing, say);
    await waitFor(() => expect(say).toHaveBeenCalledTimes(1));
  });

  it('says nothing once the page is gone, under StrictMode as well', async () => {
    const gone = vi.fn(async () => {
      await later();
      return { ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'late' };
    });
    const say = vi.fn();
    const { unmount } = renderStrict(gone, say);
    await waitFor(() => expect(gone).toHaveBeenCalled());
    unmount();
    await act(async () => later());
    expect(say).not.toHaveBeenCalled();
  });
});

describe('putting the monitoring back on leaving the Booth (#3428)', () => {
  it('says nothing on leave when the release fails with nothing owed, and says may still be on when something is owed', async () => {
    const daw = createDawMock({ daw: 'REAPER', connected: true, transport: { playing: false, recording: false } });
    const sentence = 'REAPER did not answer in time, so your input monitoring may still be on. Turn it off in REAPER.';
    daw.control.refuseNextRelease(sentence);
    const quiet = vi.fn();
    renderHook(() => useReleaseBoothMonitorOnLeave(quiet), { wrapper: wrapperFor({ dawReleaseBoothMonitor: daw.dawReleaseBoothMonitor }) }).unmount();
    await waitFor(() => expect(daw.control.armed().releases).toBe(1));
    await act(async () => {});
    expect(quiet).not.toHaveBeenCalled();
    // The Booth turned a monitoring on, and the put-back fails.
    expect((await daw.dawArmBoothVoice('c-1')).ok).toBe(true);
    daw.control.refuseNextRelease(sentence);
    const say = vi.fn();
    renderHook(() => useReleaseBoothMonitorOnLeave(say), { wrapper: wrapperFor({ dawReleaseBoothMonitor: daw.dawReleaseBoothMonitor }) }).unmount();
    await waitFor(() => expect(say).toHaveBeenCalledExactlyOnceWith(sentence));
  });

  it('says nothing when the call itself fails and no monitoring was asked for', async () => {
    const failing = vi.fn(async () => {
      throw new Error('bridge down');
    });
    const say = vi.fn();
    renderHook(() => useReleaseBoothMonitorOnLeave(say), { wrapper: wrapperFor({ dawReleaseBoothMonitor: failing }) }).unmount();
    await waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(say).not.toHaveBeenCalled();
  });

  it('releases once, when the Booth unmounts, and not while it stays', async () => {
    const dawReleaseBoothMonitor = vi.fn(async () => moved);
    const say = vi.fn();
    const { rerender, unmount } = renderHook(() => useReleaseBoothMonitorOnLeave(say), { wrapper: wrapperFor({ dawReleaseBoothMonitor }) });
    rerender();
    await act(async () => {});
    expect(dawReleaseBoothMonitor).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(dawReleaseBoothMonitor).toHaveBeenCalledTimes(1));
    expect(say).not.toHaveBeenCalled();
  });

  it("says the host's sentence when the DAW cannot be reached on leaving, so the narrator knows the monitoring may be on", async () => {
    const sentence = 'REAPER could not be reached, so your input monitoring may still be on. Turn it off in REAPER.';
    const unreachable = vi.fn(async () => ({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence }));
    const say = vi.fn();
    renderHook(() => useReleaseBoothMonitorOnLeave(say), { wrapper: wrapperFor({ dawReleaseBoothMonitor: unreachable }) }).unmount();
    await waitFor(() => expect(say).toHaveBeenCalledExactlyOnceWith(sentence));
  });

  it('says a refusal and a failed call, since the monitoring may still be on', async () => {
    const refused = vi.fn(async () => ({ ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'REAPER did not answer within 3 seconds.' }));
    const say = vi.fn();
    renderHook(() => useReleaseBoothMonitorOnLeave(say), { wrapper: wrapperFor({ dawReleaseBoothMonitor: refused }) }).unmount();
    await waitFor(() => expect(say).toHaveBeenCalledExactlyOnceWith('REAPER did not answer within 3 seconds.'));
    // A monitoring was asked for this visit, so a call that fails outright may have left it on.
    const arming = vi.fn(async () => moved);
    renderHook(() => useArmBoothOnOpen({ enabled: true, follow: true, chapterId: 'c-9', canArm: true, say: vi.fn() }), {
      wrapper: wrapperFor({ dawArmBoothVoice: arming }),
    });
    await waitFor(() => expect(arming).toHaveBeenCalledTimes(1));
    const failing = vi.fn(async () => {
      throw new Error('bridge down');
    });
    const sayFailure = vi.fn();
    renderHook(() => useReleaseBoothMonitorOnLeave(sayFailure), { wrapper: wrapperFor({ dawReleaseBoothMonitor: failing }) }).unmount();
    await waitFor(() => expect(sayFailure).toHaveBeenCalledTimes(1));
  });
});

describe('useMoveDawOnOpen with the DAW read first (the kept chapter)', () => {
  const props = { enabled: true, follow: true, chapterId: 'c-1', canFollow: true, target: { where: 'end' } as const, onlyIfElsewhere: true, say: vi.fn() };
  const elsewhere = answer({ chapterId: 'c-2', selected: 1, cursor: 9 });

  it('does not move a DAW whose read answers after the Booth has been open longer than it waits', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    let release: (place: DawPlace) => void = () => undefined;
    const dawPlace = vi.fn(() => new Promise<DawPlace>((resolve) => (release = resolve)));
    const now = vi.spyOn(Date, 'now');
    try {
      renderHook(() => useMoveDawOnOpen(props), { wrapper: wrapperFor({ dawGoToChapter, dawPlace }) });
      await waitFor(() => expect(dawPlace).toHaveBeenCalledTimes(1));
      now.mockReturnValue(Date.now() + 30_000);
      await act(async () => release(elsewhere));
      await act(async () => {});
      expect(dawGoToChapter).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });

  it('sends one move when the window gets focus while the read is out: the pull-back leaves it to the open', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    const releases: Array<(place: DawPlace) => void> = [];
    const dawPlace = vi.fn(() => new Promise<DawPlace>((resolve) => releases.push(resolve)));
    renderHook(
      () => {
        const moving = useMoveDawOnOpen(props);
        useDawPullBack('c-1', moving);
      },
      { wrapper: wrapperFor({ dawGoToChapter, dawPlace }) },
    );
    await waitFor(() => expect(dawPlace).toHaveBeenCalledTimes(1));
    await act(async () => void window.dispatchEvent(new Event('focus')));
    expect(dawPlace).toHaveBeenCalledTimes(1);
    await act(async () => releases[0]?.(elsewhere));
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledTimes(1));
    expect(dawGoToChapter).toHaveBeenCalledWith('c-1', 'end', 0);
    await act(async () => {});
    expect(dawGoToChapter).toHaveBeenCalledTimes(1);
  });
});
