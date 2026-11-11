// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoothChapterTarget } from './boothQuery';
import { useChapterNavigation } from './useChapterNavigation';

const CHAPTERS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function setup(
  over: { requested?: BoothChapterTarget | null; chapterId?: string; recording?: boolean; starting?: boolean; leave?: () => Promise<unknown> } = {},
) {
  const args = {
    requested: null as BoothChapterTarget | null,
    chapterId: 'a',
    recording: false,
    leave: vi.fn((_path: string, proceed: () => void) => {
      proceed();
      return Promise.resolve();
    }),
    adopt: vi.fn(),
    choose: vi.fn(),
    chapters: CHAPTERS,
    toast: vi.fn(),
    ...over,
  };
  const view = renderHook((props: typeof args) => useChapterNavigation(props), { initialProps: args });
  return { args, view };
}

describe('changing chapter', () => {
  it('queues presses of Next from the chapter last asked for, not the one still on screen', () => {
    const { args, view } = setup();
    act(() => view.result.current.step(1));
    act(() => view.result.current.step(1));
    expect(args.choose.mock.calls.map(([target]) => target)).toEqual([{ chapter: 'b' }, { chapter: 'c' }]);
  });

  it('stays on the chapter while the DAW is starting a take, with one sentence', () => {
    const { args, view } = setup({ starting: true });
    act(() => view.result.current.step(1));
    expect(args.choose).not.toHaveBeenCalled();
    expect(args.toast).toHaveBeenCalledWith('A take is starting, so the chapter stays until it has started.');
  });

  it('does nothing past either end of the list', () => {
    const { args, view } = setup();
    act(() => view.result.current.step(-1));
    expect(args.choose).not.toHaveBeenCalled();
  });

  it('refuses to leave a chapter during a take and says why', () => {
    const { args, view } = setup({ recording: true });
    act(() => view.result.current.changeChapter({ chapter: 'b' }));
    expect(args.choose).not.toHaveBeenCalled();
    expect(args.toast).toHaveBeenCalledWith('Stop recording first.');
  });

  it('ignores a request for the chapter already on screen', () => {
    const { args, view } = setup();
    act(() => view.result.current.changeChapter({ chapter: 'a' }));
    expect(args.choose).not.toHaveBeenCalled();
  });
});

describe('a chapter asked for in the address', () => {
  it('is shown at once when no take runs', () => {
    const { args } = setup({ requested: { chapter: 'b' } });
    expect(args.adopt).toHaveBeenCalledWith({ chapter: 'b' });
  });

  it('is asked about during a take, and shown once the narrator agrees', () => {
    const { args } = setup({ requested: { chapter: 'b' }, recording: true });
    expect(args.leave).toHaveBeenCalledTimes(1);
    expect(args.adopt).toHaveBeenCalledWith({ chapter: 'b' });
  });

  it('puts the address back on the chapter on screen when the narrator stays', async () => {
    const leave = vi.fn(() => Promise.resolve());
    const { args } = setup({ requested: { chapter: 'b' }, recording: true, leave });
    await act(async () => undefined);
    expect(args.adopt).not.toHaveBeenCalled();
    expect(args.choose).toHaveBeenCalledWith({ chapter: 'a' });
  });
});
