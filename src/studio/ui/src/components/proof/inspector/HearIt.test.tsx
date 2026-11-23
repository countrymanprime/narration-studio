// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { FindingNavigation } from '../../../api/contracts/findings';
import { createMockApi } from '../../../api/mockApi';
import type { Finding } from '../../../types';
import { HearIt, HEAR_AROUND_SECONDS, type HearItApi } from './HearIt';
import { inspectorFinding } from './testFinding';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { PortOverrides } from '../../../ports/usePort';
import { createMockDawClient } from '../../../ports/daw';
import { PLAY_DEADLINE_MS } from '../../engine/ShowInDaw';
import { overlay } from '../../../overlay/overlayService';

afterEach(cleanup);

const placed = (overrides: Partial<Finding> = {}) =>
  inspectorFinding({
    source: { item_guid: 'g1', file: 'C:/Book/ch1 take.wav' },
    time_range: { start: 12.4, end: 14, source_start: 10, source_end: 11 },
    ...overrides,
  });
const looping: FindingNavigation = { outcome: 'looping', loopStart: 9.4, loopEnd: 17 };
const refusedAs = (reason: 'standalone' | 'not_running' | 'no_item' | 'stale' | 'recording' | 'script_outdated' | 'failed', message = `refused: ${reason}`) =>
  ({ outcome: 'refused', reason, message }) as FindingNavigation;

let play: ReturnType<typeof vi.fn>;
let toast: ReturnType<typeof vi.spyOn>;
/** The last toast's text, and whether it offers Retry (the only way a play that did not happen is said: never a line in the row). */
const toasted = () => toast.mock.calls.at(-1) as [string, { tone?: string; action?: { label: string; onAction: () => void } } | undefined];
let currentTimes: number[];
beforeEach(() => {
  toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
  play = vi.fn(async () => undefined);
  currentTimes = [];
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as never);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set').mockImplementation((value: number) => {
    currentTimes.push(value);
  });
});

/** The row's status line, as InspectorActions draws it. */
function Harness(props: Omit<Parameters<typeof HearIt>[0], 'onResult'>) {
  const [result, setResult] = useState<{ message: string; failed: boolean }>();
  return (
    <>
      <HearIt {...props} onResult={setResult} />
      {result?.failed ? <p role="alert">{result.message}</p> : <p role="status">{result?.message}</p>}
    </>
  );
}

function setup(
  finding: Finding,
  loop: FindingNavigation | (() => Promise<FindingNavigation>),
  props: Partial<Omit<Parameters<typeof HearIt>[0], 'onResult'>> = {},
) {
  const api: HearItApi = {
    findingsLoop: vi.fn(typeof loop === 'function' ? loop : async () => loop),
    findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 3, kept: 0 })),
  };
  const mediaApi = createMockApi();
  const mediaUrl = vi.spyOn(mediaApi, 'mediaUrl');
  const view = render(
    <ApiProvider api={mediaApi}>
      <Harness finding={finding} api={api} dawName="REAPER" capabilities={DAW_SETUPS.reaper} {...props} />
    </ApiProvider>,
  );
  return { api, mediaUrl, view };
}

const hear = () => screen.getByRole('button', { name: /^Hear it/ });
const status = () => screen.getByRole('status').textContent;

describe('hear-it-plays-the-note-with-3-s-either-side', () => {
  it('plays 3 s either side', () => {
    expect(HEAR_AROUND_SECONDS).toBe(3);
  });

  it('loops the note in the DAW through FindingsLoop and says where it plays', async () => {
    const t = setup(placed(), looping);
    await userEvent.click(hear());
    expect(t.api.findingsLoop).toHaveBeenCalledWith('f1');
    expect(play).not.toHaveBeenCalled();
    await waitFor(() => expect(status()).toBe('Playing in REAPER, 3 s either side.'));
    expect(screen.getByRole('button', { name: /^Stop hearing it/ })).toBeTruthy();
  });

  it('a second press stops the DAW loop and puts the button back', async () => {
    const t = setup(placed(), looping);
    await userEvent.click(hear());
    await userEvent.click(await screen.findByRole('button', { name: /^Stop hearing it/ }));
    expect(t.api.findingsStopLoop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(hear()).toBeTruthy());
  });

  it('stops the loop it started when the Inspector moves to another note', async () => {
    const t = setup(placed(), looping);
    await userEvent.click(hear());
    await screen.findByRole('button', { name: /^Stop hearing it/ });
    t.view.unmount();
    expect(t.api.findingsStopLoop).toHaveBeenCalledTimes(1);
  });

  it.each(['standalone', 'not_running', 'no_item', 'stale', 'script_outdated', 'failed'] as const)(
    'falls back to the app player when the DAW refuses as %s, from 3 s before the source start',
    async (reason) => {
      const t = setup(placed(), refusedAs(reason));
      await userEvent.click(hear());
      await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
      expect(t.mediaUrl).toHaveBeenCalledWith('C:/Book/ch1 take.wav');
      expect(currentTimes.at(-1)).toBe(7);
      // The DAW's reason, and who played instead, is a toast (playback/providers.ts); the row says it is playing. It plays, so no Retry is offered.
      expect(toasted()[0]).toBe(`Refused: ${reason}. Played in the app instead.`);
      expect(toasted()[1]?.action).toBeUndefined();
      // The toast says the app plays; the row does not say it twice.
      expect(status()).toBe('');
    },
  );

  it('falls back to the app player when the host call itself fails', async () => {
    setup(placed(), () => Promise.reject(new Error('bridge gone')));
    await userEvent.click(hear());
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(toasted()[0]).toMatch(/^REAPER was not asked: .*bridge gone.*\. Played in the app instead\.$/);
    expect(status()).toBe('');
  });

  it('asks the DAW nothing while it is not running, and plays in the app with its sentence', async () => {
    const api: HearItApi = {
      findingsLoop: vi.fn(async () => looping),
      findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 })),
    };
    render(
      <ApiProvider api={createMockApi()}>
        <Harness finding={placed()} api={api} dawName="REAPER" capabilities={DAW_SETUPS['reaper-off']} />
      </ApiProvider>,
    );
    await userEvent.click(hear());
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(api.findingsLoop).not.toHaveBeenCalled();
    expect(status()).toBe('');
  });

  // #4076, owner rule on #4043: the DAW's capabilities not being answered yet is no reason to hold the click back.
  it('asks the DAW at once before its capabilities answer, and plays it', async () => {
    const api: HearItApi = {
      findingsLoop: vi.fn(async () => looping),
      findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 })),
    };
    render(
      <ApiProvider api={createMockApi()}>
        <Harness finding={placed()} api={api} dawName="the DAW" />
      </ApiProvider>,
    );
    await userEvent.click(hear());
    await waitFor(() => expect(status()).toBe('Playing in the DAW, 3 s either side.'));
    expect(api.findingsLoop).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });

  const NO_AUDIO = { item_guid: 'g1' };
  it('says why, with Retry that asks the DAW again, when the DAW, not yet heard, refuses and the app has no audio', async () => {
    const api: HearItApi = {
      findingsLoop: vi.fn(async () => refusedAs('not_running', 'REAPER is not running.')),
      findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 })),
    };
    render(
      <ApiProvider api={createMockApi()}>
        <Harness finding={placed({ source: NO_AUDIO })} api={api} dawName="the DAW" />
      </ApiProvider>,
    );
    await userEvent.click(hear());
    await waitFor(() => expect(toasted()[0]).toBe('REAPER is not running. The app has no audio file for this note either.'));
    expect(toasted()[1]?.tone).toBe('error');
    toasted()[1]!.action!.onAction();
    await waitFor(() => expect(api.findingsLoop).toHaveBeenCalledTimes(2));
  });

  it('plays nothing late once the note was left while the DAW was being asked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api: HearItApi = {
        findingsLoop: vi.fn(() => new Promise<FindingNavigation>(() => {})),
        findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 })),
      };
      const { unmount } = render(
        <ApiProvider api={createMockApi()}>
          <Harness finding={placed()} api={api} dawName="REAPER" capabilities={DAW_SETUPS.reaper} />
        </ApiProvider>,
      );
      fireEvent.click(hear());
      await vi.advanceTimersByTimeAsync(10);
      unmount();
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS);
      expect(play).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops a loop the DAW starts after the note was left, inside the deadline', async () => {
    let answerLoop: (value: FindingNavigation) => void = () => {};
    const api: HearItApi = {
      findingsLoop: vi.fn(() => new Promise<FindingNavigation>((resolve) => (answerLoop = resolve))),
      findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 })),
    };
    const { unmount } = render(
      <ApiProvider api={createMockApi()}>
        <Harness finding={placed()} api={api} dawName="REAPER" capabilities={DAW_SETUPS.reaper} />
      </ApiProvider>,
    );
    await userEvent.click(hear());
    unmount();
    answerLoop({ outcome: 'looping', loopStart: 1, loopEnd: 2 });
    await waitFor(() => expect(api.findingsStopLoop).toHaveBeenCalledTimes(1));
  });

  it('a late loop answer of an older press does not stop the loop a newer press started', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const answers: ((value: FindingNavigation) => void)[] = [];
      const api: HearItApi = {
        findingsLoop: vi.fn(() => new Promise<FindingNavigation>((resolve) => answers.push(resolve))),
        findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 })),
      };
      render(
        <ApiProvider api={createMockApi()}>
          <Harness finding={placed()} api={api} dawName="REAPER" capabilities={DAW_SETUPS.reaper} />
        </ApiProvider>,
      );
      fireEvent.click(hear());
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS);
      await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
      // The app plays; Stop, then press again: the second press's loop starts.
      fireEvent.click(await screen.findByRole('button', { name: /^Stop hearing it/ }));
      await waitFor(() => expect(hear()).toBeTruthy());
      (api.findingsStopLoop as ReturnType<typeof vi.fn>).mockClear();
      fireEvent.click(hear());
      await vi.advanceTimersByTimeAsync(10);
      answers[1]!({ outcome: 'looping', loopStart: 1, loopEnd: 2 });
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop hearing it/ })).toBeTruthy());
      // The first press's DAW answers late: it must not stop the second press's loop.
      answers[0]!({ outcome: 'looping', loopStart: 1, loopEnd: 2 });
      await vi.advanceTimersByTimeAsync(10);
      expect(api.findingsStopLoop).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an answer for a note that was left does not stop the loop a newer note started', async () => {
    const answers: ((value: FindingNavigation) => void)[] = [];
    const stopLoop = vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 }));
    const apiFor = (): HearItApi => ({
      findingsLoop: vi.fn(() => new Promise<FindingNavigation>((resolve) => answers.push(resolve))),
      findingsStopLoop: stopLoop,
    });
    const first = render(
      <ApiProvider api={createMockApi()}>
        <Harness finding={placed()} api={apiFor()} dawName="REAPER" capabilities={DAW_SETUPS.reaper} />
      </ApiProvider>,
    );
    await userEvent.click(hear());
    first.unmount();
    // The next note: its loop answers at once.
    render(
      <ApiProvider api={createMockApi()}>
        <Harness finding={placed({ id: 'f2' })} api={apiFor()} dawName="REAPER" capabilities={DAW_SETUPS.reaper} />
      </ApiProvider>,
    );
    await userEvent.click(hear());
    answers[1]!({ outcome: 'looping', loopStart: 1, loopEnd: 2 });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop hearing it/ })).toBeTruthy());
    // The old note's answer comes late: it must not stop the loop the newer note owns.
    answers[0]!({ outcome: 'looping', loopStart: 1, loopEnd: 2 });
    await waitFor(() => expect(stopLoop).not.toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stopLoop).not.toHaveBeenCalled();
  });

  it('says where to stop a loop it could not stop after the note was left', async () => {
    let answerLoop: (value: FindingNavigation) => void = () => {};
    const api: HearItApi = {
      findingsLoop: vi.fn(() => new Promise<FindingNavigation>((resolve) => (answerLoop = resolve))),
      findingsStopLoop: vi.fn(async () => {
        throw new Error('bridge write failed');
      }),
    };
    const { unmount } = render(
      <ApiProvider api={createMockApi()}>
        <Harness finding={placed()} api={api} dawName="REAPER" capabilities={DAW_SETUPS.reaper} />
      </ApiProvider>,
    );
    await userEvent.click(hear());
    unmount();
    answerLoop({ outcome: 'looping', loopStart: 1, loopEnd: 2 });
    await waitFor(() => expect(toasted()[0]).toBe('REAPER was not asked to stop: bridge write failed. Stop it in REAPER.'));
  });

  it('a Retry offered for an older press plays nothing, and none plays once the note was left', async () => {
    const api: HearItApi = {
      findingsLoop: vi.fn(async () => refusedAs('not_running', 'REAPER is not running.')),
      findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 })),
    };
    const dismiss = vi.spyOn(overlay, 'dismissTopic');
    const { unmount } = render(
      <ApiProvider api={createMockApi()}>
        <Harness finding={placed({ source: NO_AUDIO })} api={api} dawName="REAPER" />
      </ApiProvider>,
    );
    await userEvent.click(hear());
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    const retry = toasted()[1]!.action!.onAction;
    unmount();
    expect(dismiss).toHaveBeenCalledWith('proof-hear-it-retry');
    retry();
    expect(api.findingsLoop).toHaveBeenCalledTimes(1);
  });

  it('plays nothing and says why when the DAW records and its loop call fails', async () => {
    const api: HearItApi = {
      findingsLoop: vi.fn(async () => Promise.reject(new Error('bridge gone'))),
      findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 })),
    };
    const daw = {
      ...createMockDawClient(DAW_SETUPS.reaper),
      projectState: async () => ({ savedAt: null, unsavedChanges: false, playState: 'recording' as const, playPosition: 1 }),
    };
    render(
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw }}>
          <Harness finding={placed()} api={api} dawName="REAPER" capabilities={DAW_SETUPS.reaper} />
        </PortOverrides>
      </ApiProvider>,
    );
    await userEvent.click(hear());
    await waitFor(() => expect(toasted()[0]).toBe('REAPER is recording, so nothing plays. Stop recording first.'));
    expect(toasted()[1]?.action?.label).toBe('Retry');
    expect(play).not.toHaveBeenCalled();
  });

  it('a loop call that never answers hands the note to the app after the deadline', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answerLoop: (value: FindingNavigation) => void = () => {};
    try {
      const api: HearItApi = {
        findingsLoop: vi.fn(() => new Promise<FindingNavigation>((resolve) => (answerLoop = resolve))),
        findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 })),
      };
      render(
        <ApiProvider api={createMockApi()}>
          <Harness finding={placed()} api={api} dawName="REAPER" capabilities={DAW_SETUPS.reaper} />
        </ApiProvider>,
      );
      fireEvent.click(hear());
      await vi.advanceTimersByTimeAsync(10);
      expect(hear().getAttribute('aria-busy')).toBe('true');
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS);
      await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
      expect(toasted()[0]).toBe('REAPER did not answer in time. Played in the app instead.');
      // The button was busy while the DAW was asked, and is not now.
      // The DAW answers after all: its loop is stopped, not left beside the app's clip.
      answerLoop({ outcome: 'looping', loopStart: 1, loopEnd: 2 });
      await vi.advanceTimersByTimeAsync(0);
      expect(api.findingsStopLoop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a read that failed is asked again and plays in the app, saying why', async () => {
    const readAgain = vi.fn();
    const api: HearItApi = {
      findingsLoop: vi.fn(async () => looping),
      findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 0, kept: 0 })),
    };
    render(
      <ApiProvider api={createMockApi()}>
        <Harness finding={placed()} api={api} dawName="the DAW" capabilitiesFailed onReadAgain={readAgain} />
      </ApiProvider>,
    );
    await userEvent.click(hear());
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(api.findingsLoop).not.toHaveBeenCalled();
    expect(readAgain).toHaveBeenCalledTimes(1);
    expect(toasted()[0]).toMatch(/could not ask the DAW/);
  });

  it('never plays in the app while the DAW records: shows the DAW’s sentence', async () => {
    setup(placed(), refusedAs('recording', 'REAPER is recording, so nothing was moved. Stop recording first.'));
    await userEvent.click(hear());
    // The host's sentence is about moving the cursor; Hear it says what it means for playing. It is a toast with Retry, never a line in the row.
    await waitFor(() => expect(toasted()[0]).toBe('REAPER is recording, so nothing plays. Stop recording first.'));
    expect(toasted()[1]?.action?.label).toBe('Retry');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('shows the DAW’s sentence when the app has no audio for the note either', async () => {
    setup(placed({ source: { item_guid: 'g1' } }), refusedAs('not_running', 'REAPER is not answering.'));
    await userEvent.click(hear());
    await waitFor(() => expect(toasted()[0]).toBe('REAPER is not answering. The app has no audio file for this note either.'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('is off, with a reason, for a note with no time in its audio', () => {
    setup(placed({ time_range: undefined }), looping);
    expect(hear().getAttribute('aria-disabled')).toBe('true');
  });

  it('is off while the evidence changed', () => {
    setup(placed(), looping, { inert: true });
    const button = hear() as HTMLButtonElement;
    expect(button.disabled || button.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('a rapid double press sends one loop', async () => {
    let answer: (value: FindingNavigation) => void = () => undefined;
    const t = setup(placed(), () => new Promise<FindingNavigation>((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    await user.dblClick(hear());
    answer(looping);
    await waitFor(() => expect(status()).toMatch(/Playing in REAPER/));
    expect(t.api.findingsLoop).toHaveBeenCalledTimes(1);
  });

  it('the app clip ending puts the button back and clears its Playing line', async () => {
    // A recorder that never declared the loop: the app plays as its normal path, with no toast, so the row says so.
    setup(placed(), refusedAs('standalone'), { capabilities: DAW_SETUPS.builtin });
    await userEvent.click(hear());
    await waitFor(() => expect(status()).toMatch(/Playing in the app/));
    const audio = play.mock.contexts.at(-1) as HTMLMediaElement;
    Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => 99 });
    audio.dispatchEvent(new Event('timeupdate'));
    await waitFor(() => expect(hear()).toBeTruthy());
    expect(status()).toBe('');
  });

  it('a second press stops the app player', async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    setup(placed(), refusedAs('standalone'));
    await userEvent.click(hear());
    await userEvent.click(await screen.findByRole('button', { name: /^Stop hearing it/ }));
    expect(pause).toHaveBeenCalled();
    await waitFor(() => expect(hear()).toBeTruthy());
  });
});
