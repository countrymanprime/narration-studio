// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoothChapterTarget } from './boothQuery';
import { useChapterNavigation } from './useChapterNavigation';

type Base = Omit<Parameters<typeof useChapterNavigation>[0], 'requested' | 'choose'>;
// The hook with a real address: `choose` puts the target in `requested`, as writing it to the URL does.
const withAddress = (base: Base) =>
  renderHook(() => {
    const [requested, setRequested] = useState<BoothChapterTarget | null>(null);
    return useChapterNavigation({ ...base, requested, choose: setRequested });
  });

const CHAPTERS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function setup(
  over: {
    requested?: BoothChapterTarget | null;
    chapterId?: string;
    recording?: boolean;
    starting?: boolean;
    endUnconfirmed?: () => boolean;
    whileRecording?: string;
    leave?: (path: string, proceed: () => void) => Promise<unknown>;
  } = {},
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

describe('changing chapter during a take REAPER started (A1)', () => {
  it('says to stop it in REAPER, not "Stop the take first", and goes nowhere', () => {
    const { args, view } = setup({ recording: true, whileRecording: 'REAPER started this take, so stop it in REAPER.' });
    act(() => view.result.current.step(1));
    expect(args.choose).not.toHaveBeenCalled();
    expect(args.toast).toHaveBeenCalledExactlyOnceWith('REAPER started this take, so stop it in REAPER.', 'daw-held');
  });
});

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
    expect(args.toast).toHaveBeenCalledWith('Not while recording. Stop the take first.', 'daw-held');
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

  // #3555 (second chapter change while Stop and leave waits): a later address replaces what the open question opens, and asks nothing itself.
  describe('another chapter asked for while the first question is open', () => {
    const openQuestion = () => {
      let answer: (yes: boolean) => void = () => undefined;
      const leave = vi.fn(
        (_path: string, proceed: () => void) =>
          new Promise<void>((resolve) => {
            answer = (yes) => {
              if (yes) proceed();
              resolve();
            };
          }),
      );
      const { args, view } = setup({ requested: { chapter: 'b' }, recording: true, leave });
      return { args, view, leave, answer: (yes: boolean) => answer(yes) };
    };

    it('opens the chapter asked for last when the narrator agrees, and asks only once', async () => {
      const { args, view, leave, answer } = openQuestion();
      view.rerender({ ...args, requested: { chapter: 'c' } });
      expect(leave).toHaveBeenCalledTimes(1);
      await act(async () => answer(true));
      expect(args.adopt).toHaveBeenCalledTimes(1);
      expect(args.adopt).toHaveBeenCalledWith({ chapter: 'c' });
      expect(args.choose).not.toHaveBeenCalled();
    });

    // BREAK A of the qa pass: a chapter link arriving while another exit's question is open (Escape, the nav) joins that exit; if the narrator lets go, nothing is put back.
    it('puts nothing back when the exit it joined lets the narrator go', async () => {
      const { args } = setup({ requested: { chapter: 'b' }, recording: true, leave: () => Promise.resolve(true) });
      await act(async () => undefined);
      expect(args.choose).not.toHaveBeenCalled();
      expect(args.adopt).not.toHaveBeenCalled();
    });

    it('puts the address back on the chapter on screen once, not on a chapter nobody asked for, when the narrator stays', async () => {
      const { args, view, answer } = openQuestion();
      view.rerender({ ...args, requested: { chapter: 'c' } });
      await act(async () => answer(false));
      expect(args.adopt).not.toHaveBeenCalled();
      expect(args.choose).toHaveBeenCalledTimes(1);
      expect(args.choose).toHaveBeenCalledWith({ chapter: 'a' });
    });
  });
});

// The class guard (#3320): a take that is running or only starting is never walked away from by any route to another chapter. The picker and Next say so;
// an address (a Script card, a bookmark, Back, a pickup link) asks the leave question, and staying keeps the chapter.
describe('every route to another chapter respects a take that records or is starting', () => {
  for (const state of ['recording', 'starting'] as const) {
    const flags = { recording: state === 'recording', starting: state === 'starting' };
    it(`${state}: the picker changes nothing and says why`, () => {
      const { args, view } = setup(flags);
      act(() => view.result.current.changeChapter({ chapter: 'b' }));
      expect(args.choose).not.toHaveBeenCalled();
      expect(args.toast).toHaveBeenCalledTimes(1);
    });
    it(`${state}: Next changes nothing and says why`, () => {
      const { args, view } = setup(flags);
      act(() => view.result.current.step(1));
      expect(args.choose).not.toHaveBeenCalled();
      expect(args.toast).toHaveBeenCalledTimes(1);
    });
    it(`${state}: an address asks the leave question first, and staying keeps the chapter`, async () => {
      const leave = vi.fn(() => Promise.resolve());
      const { args } = setup({ ...flags, requested: { chapter: 'b' }, leave });
      await act(async () => {});
      expect(leave).toHaveBeenCalledTimes(1);
      expect(args.adopt).not.toHaveBeenCalled();
    });
  }
});

// #3528 (qa-breaker): a DAW that went quiet may still be recording. Its end is not confirmed, so every route to another chapter asks the same question a running take's does
// (the picker, Next and Previous through `leave` with the Booth's own address, an address likewise) instead of moving silently, and staying keeps the chapter.
describe('every route to another chapter asks when the DAW went quiet and the end is unconfirmed', () => {
  const quiet = { endUnconfirmed: () => true };
  it('the picker asks the leave question with the chapter address, and moves only when the narrator agrees', async () => {
    const leave = vi.fn(() => Promise.resolve());
    const { args, view } = setup({ ...quiet, leave });
    act(() => view.result.current.changeChapter({ chapter: 'b' }));
    expect(leave).toHaveBeenCalledWith('/booth?chapter=b', expect.any(Function));
    expect(args.choose).not.toHaveBeenCalled();
    expect(args.toast).not.toHaveBeenCalled();
  });
  it('Next and Previous ask too, and a yes moves one chapter', () => {
    const next = setup({ ...quiet, chapterId: 'b' });
    act(() => next.view.result.current.step(1));
    expect(next.args.leave).toHaveBeenCalledWith('/booth?chapter=c', expect.any(Function));
    expect(next.args.choose).toHaveBeenCalledWith({ chapter: 'c' });
    const previous = setup({ ...quiet, chapterId: 'b' });
    act(() => previous.view.result.current.step(-1));
    expect(previous.args.leave).toHaveBeenCalledWith('/booth?chapter=a', expect.any(Function));
    expect(previous.args.choose).toHaveBeenCalledWith({ chapter: 'a' });
  });
  it('an address asks the leave question first, and staying keeps the chapter', async () => {
    const leave = vi.fn(() => Promise.resolve());
    const { args } = setup({ ...quiet, requested: { chapter: 'b' }, leave });
    await act(async () => {});
    expect(leave).toHaveBeenCalledTimes(1);
    expect(args.adopt).not.toHaveBeenCalled();
    expect(args.choose).toHaveBeenCalledWith({ chapter: 'a' });
  });
  it('a take whose end is confirmed changes chapter with no question', () => {
    const { args, view } = setup({ endUnconfirmed: () => false });
    act(() => view.result.current.changeChapter({ chapter: 'b' }));
    expect(args.leave).not.toHaveBeenCalled();
    expect(args.choose).toHaveBeenCalledWith({ chapter: 'b' });
  });
});

// ux-reviewer on the chapter question: writing the confirmed chapter to the address brings it back as a request, and with the end still unconfirmed it asked a second time (Leave anyway
// landed nowhere). The hook is run here with a real `choose` that puts the target in `requested`, as the address does, and the leave question answered yes: it must ask once and open the chapter.
describe('a chapter the narrator said yes to opens without a second question', () => {
  const run = (change: (api: ReturnType<typeof useChapterNavigation>) => void, chapterId = 'a') => {
    const leave = vi.fn((_path: string, proceed: () => void) => {
      proceed();
      return Promise.resolve();
    });
    const adopt = vi.fn();
    const base = { chapterId, recording: false, endUnconfirmed: () => true, leave, adopt, chapters: CHAPTERS, toast: vi.fn() };
    const view = withAddress(base);
    act(() => change(view.result.current));
    return { leave, adopt };
  };
  it('the picker asks once and the chapter opens', () => {
    const { leave, adopt } = run((api) => api.changeChapter({ chapter: 'b' }));
    expect(leave).toHaveBeenCalledTimes(1);
    expect(adopt).toHaveBeenCalledWith({ chapter: 'b' });
  });
  it('Next and Previous ask once and the chapter opens', () => {
    const next = run((api) => api.step(1));
    expect(next.leave).toHaveBeenCalledTimes(1);
    expect(next.adopt).toHaveBeenCalledWith({ chapter: 'b' });
    const previous = run((api) => api.step(-1), 'b');
    expect(previous.leave).toHaveBeenCalledTimes(1);
    expect(previous.adopt).toHaveBeenCalledWith({ chapter: 'a' });
  });
});

// Class guard (qa-breaker N1): every route to another chapter, with the DAW quiet, asks exactly once whichever way it is answered, and a yes opens the chapter; a stay does not.
describe('every chapter route x every answer, with the end unconfirmed', () => {
  const routes: [string, (api: ReturnType<typeof useChapterNavigation>) => void, string, string][] = [
    ['the picker', (api) => api.changeChapter({ chapter: 'c' }), 'a', 'c'],
    ['Next', (api) => api.step(1), 'a', 'b'],
    ['Previous', (api) => api.step(-1), 'b', 'a'],
  ];
  for (const [route, change, from, to] of routes) {
    for (const answer of ['yes', 'stay'] as const) {
      it(`${route}, ${answer}: asks once and ${answer === 'yes' ? 'opens' : 'does not open'} the chapter`, async () => {
        const leave = vi.fn((_path: string, proceed: () => void) => {
          if (answer === 'yes') proceed();
          return Promise.resolve();
        });
        const adopt = vi.fn();
        const base = { chapterId: from, recording: false, endUnconfirmed: () => true, leave, adopt, chapters: CHAPTERS, toast: vi.fn() };
        const view = withAddress(base);
        await act(async () => change(view.result.current));
        expect(leave).toHaveBeenCalledTimes(1);
        if (answer === 'yes') expect(adopt).toHaveBeenCalledWith({ chapter: to });
        else expect(adopt).not.toHaveBeenCalled();
      });
    }
  }
  for (const answer of ['yes', 'stay'] as const) {
    it(`an address, ${answer}: asks once and ${answer === 'yes' ? 'opens' : 'keeps'} the chapter`, async () => {
      const leave = vi.fn((_path: string, proceed: () => void) => {
        if (answer === 'yes') proceed();
        return Promise.resolve();
      });
      const adopt = vi.fn();
      const choose = vi.fn();
      renderHook(() =>
        useChapterNavigation({
          requested: { chapter: 'b' },
          chapterId: 'a',
          recording: false,
          endUnconfirmed: () => true,
          leave,
          adopt,
          choose,
          chapters: CHAPTERS,
          toast: vi.fn(),
        }),
      );
      await act(async () => {});
      expect(leave).toHaveBeenCalledTimes(1);
      if (answer === 'yes') expect(adopt).toHaveBeenCalledWith({ chapter: 'b' });
      else expect(choose).toHaveBeenCalledWith({ chapter: 'a' });
    });
  }
});

// qa-breaker M1: the narrator's yes belongs to the request it was given for. If the address ends up somewhere else (a link that came while the question was open), no marker may
// stay behind to let a later request for that chapter open without asking, least of all during a running take.
describe('a yes the address then overrides leaves no marker behind', () => {
  beforeEach(() => void vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => void vi.useRealTimers());
  type Props = { requested: BoothChapterTarget | null; recording: boolean };
  const mount = () => {
    const answer = { yes: true };
    const leave = vi.fn((_path: string, proceed: () => void) => {
      if (answer.yes) proceed();
      return Promise.resolve();
    });
    const adopt = vi.fn();
    const choose = vi.fn();
    const view = renderHook(
      ({ requested, recording }: Props) =>
        useChapterNavigation({ requested, chapterId: 'a', recording, endUnconfirmed: () => true, leave, adopt, choose, chapters: CHAPTERS, toast: vi.fn() }),
      { initialProps: { requested: null, recording: false } as Props },
    );
    return { leave, adopt, choose, view, answer };
  };
  for (const later of [{ chapter: 'c' }, null] as const) {
    for (const recording of [true, false]) {
      it(`a yes for b, the address then ${later ? 'asks for c' : 'is cleared'}: a later request for b asks (recording ${recording})`, async () => {
        const { leave, adopt, view, answer } = mount();
        // The question for b is answered, but the address was already moved off b by something else: `choose` writes nothing the hook sees.
        act(() => view.result.current.changeChapter({ chapter: 'b' }));
        expect(leave).toHaveBeenCalledTimes(1);
        view.rerender({ requested: later, recording: false });
        // From here a question is only asked, not answered: a request that opens without asking is the break.
        answer.yes = false;
        adopt.mockClear();
        leave.mockClear();
        // Later than the answer's own request: the yes has expired, and a running take never opens on a yes at all.
        vi.setSystemTime(Date.now() + 2500);
        view.rerender({ requested: { chapter: 'b' }, recording });
        await act(async () => {});
        expect(leave).toHaveBeenCalledTimes(1);
        expect(adopt).not.toHaveBeenCalled();
      });
    }
  }
  // The yes is stamped when it is given (Stop and leave, Leave anyway), not when the question opened: a slow stop or a late press does not expire it.
  it('a Leave anyway pressed long after the question opened still opens the chapter', async () => {
    let proceed: () => void = () => {};
    const leave = vi.fn((_path: string, p: () => void) => {
      proceed = p;
      return Promise.resolve();
    });
    const adopt = vi.fn();
    const view = renderHook(() => {
      const [requested, setRequested] = useState<BoothChapterTarget | null>(null);
      return useChapterNavigation({
        requested,
        chapterId: 'a',
        recording: false,
        endUnconfirmed: () => true,
        leave,
        adopt,
        choose: setRequested,
        chapters: CHAPTERS,
        toast: vi.fn(),
      });
    });
    act(() => view.result.current.changeChapter({ chapter: 'b' }));
    vi.setSystemTime(Date.now() + 30_000);
    await act(async () => proceed());
    expect(adopt).toHaveBeenCalledWith({ chapter: 'b' });
  });
  it('a yes while the address already asks for that chapter opens it at once, with no marker left', async () => {
    const { leave, adopt, view, answer } = mount();
    view.rerender({ requested: { chapter: 'b' }, recording: false });
    await act(async () => {});
    leave.mockClear();
    adopt.mockClear();
    act(() => view.result.current.changeChapter({ chapter: 'b' }));
    expect(adopt).toHaveBeenCalledWith({ chapter: 'b' });
    answer.yes = false;
    view.rerender({ requested: { chapter: 'c' }, recording: false });
    await act(async () => {});
    view.rerender({ requested: { chapter: 'b' }, recording: true });
    await act(async () => {});
    expect(leave).toHaveBeenLastCalledWith('/booth?chapter=b', expect.any(Function));
  });
});
