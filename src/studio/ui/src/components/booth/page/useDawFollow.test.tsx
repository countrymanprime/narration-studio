// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawPlace } from '../../../api/contracts/daw';
import type { ScopedSettingField } from '../../../api/contracts/system';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { useFollowChapterInDaw } from '../../../hooks/useDawGoesToChapter';
import { useArmBoothOnOpen, useFollowDawOnOpen, useMoveDawOnOpen, useReleaseBoothMonitorOnLeave } from './useDawFollow';

afterEach(() => {
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

  it('arms the voice chosen during a take once the take stops, and sends nothing for a take with no voice change', async () => {
    const dawArmBoothVoice = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, recording: false, voice: 'v1' },
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledTimes(1));
    // A take with no voice change: no second call.
    rerender({ ...base, recording: true, voice: 'v1' });
    rerender({ ...base, recording: false, voice: 'v1' });
    await act(async () => {});
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(1);
    // A voice chosen during the take: armed and monitored once it stops.
    rerender({ ...base, recording: true, voice: 'v1' });
    rerender({ ...base, recording: true, voice: 'v2' });
    await act(async () => {});
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(1);
    rerender({ ...base, recording: false, voice: 'v2' });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledTimes(2));
  });

  it('re-entering during a take cancels the waiting release, and arms once the take stops', async () => {
    const dawArmBoothVoice = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, recording: true, voice: 'v1' },
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledExactlyOnceWith('c-1'));
    rerender({ ...base, recording: false, voice: 'v1' });
    await waitFor(() => expect(dawArmBoothVoice).toHaveBeenCalledTimes(2));
  });

  it('a refused re-arm after a stop is tried once more, and said once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const dawArmBoothVoice = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'REAPER is already recording.' })
      .mockResolvedValue(moved);
    const say = vi.fn();
    renderHook(() => useArmBoothOnOpen({ ...base, say }), { wrapper: wrapperFor({ dawArmBoothVoice }) });
    await act(async () => {});
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledExactlyOnceWith('REAPER is already recording.');
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(dawArmBoothVoice).toHaveBeenCalledTimes(2);
    expect(say).toHaveBeenCalledTimes(1);
  });

  it('does not arm again after a take when the switch is off', async () => {
    const dawArmBoothVoice = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useArmBoothOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, follow: false as boolean | undefined, recording: true },
      wrapper: wrapperFor({ dawArmBoothVoice }),
    });
    rerender({ ...base, follow: false, recording: false });
    await act(async () => {});
    expect(dawArmBoothVoice).not.toHaveBeenCalled();
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
});

describe('putting the monitoring back on leaving the Booth (#3428)', () => {
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

  it('says a refusal and a failed call, since the monitoring may still be on', async () => {
    const refused = vi.fn(async () => ({ ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'REAPER did not answer within 3 seconds.' }));
    const say = vi.fn();
    renderHook(() => useReleaseBoothMonitorOnLeave(say), { wrapper: wrapperFor({ dawReleaseBoothMonitor: refused }) }).unmount();
    await waitFor(() => expect(say).toHaveBeenCalledExactlyOnceWith('REAPER did not answer within 3 seconds.'));
    const failing = vi.fn(async () => {
      throw new Error('bridge down');
    });
    const sayFailure = vi.fn();
    renderHook(() => useReleaseBoothMonitorOnLeave(sayFailure), { wrapper: wrapperFor({ dawReleaseBoothMonitor: failing }) }).unmount();
    await waitFor(() => expect(sayFailure).toHaveBeenCalledTimes(1));
  });
});
