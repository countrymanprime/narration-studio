// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { FindingNavigation } from '../../../api/contracts/findings';
import { createMockApi } from '../../../api/mockApi';
import type { Finding } from '../../../types';
import { HearIt, HEAR_AROUND_SECONDS, type HearItApi } from './HearIt';
import { inspectorFinding } from './testFinding';

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
let currentTimes: number[];
beforeEach(() => {
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

function setup(finding: Finding, loop: FindingNavigation | (() => Promise<FindingNavigation>), props: { inert?: boolean } = {}) {
  const api: HearItApi = {
    findingsLoop: vi.fn(typeof loop === 'function' ? loop : async () => loop),
    findingsStopLoop: vi.fn(async () => ({ outcome: 'stopped' as const, restored: 3, kept: 0 })),
  };
  const mediaApi = createMockApi();
  const mediaUrl = vi.spyOn(mediaApi, 'mediaUrl');
  const view = render(
    <ApiProvider api={mediaApi}>
      <Harness finding={finding} api={api} dawName="REAPER" {...props} />
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
    await waitFor(() => expect(status()).toBe('Playing in REAPER, 3 s either side. Press again to stop.'));
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
      expect(status()).toBe('Playing in the app, 3 s either side. Press again to stop.');
    },
  );

  it('falls back to the app player when the host call itself fails', async () => {
    setup(placed(), () => Promise.reject(new Error('bridge gone')));
    await userEvent.click(hear());
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  });

  it('never plays in the app while the DAW records: shows the DAW’s sentence', async () => {
    setup(placed(), refusedAs('recording', 'REAPER is recording, so nothing was moved. Stop recording first.'));
    await userEvent.click(hear());
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'REAPER is recording, so nothing was moved. Stop recording first.');
    expect(play).not.toHaveBeenCalled();
  });

  it('shows the DAW’s sentence when the app has no audio for the note either', async () => {
    setup(placed({ source: { item_guid: 'g1' } }), refusedAs('not_running', 'REAPER is not answering.'));
    await userEvent.click(hear());
    expect((await screen.findByRole('alert')).textContent).toBe('REAPER is not answering. The app has no audio file for this note either.');
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

  it('a second press stops the app player', async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    setup(placed(), refusedAs('standalone'));
    await userEvent.click(hear());
    await userEvent.click(await screen.findByRole('button', { name: /^Stop hearing it/ }));
    expect(pause).toHaveBeenCalled();
    await waitFor(() => expect(hear()).toBeTruthy());
  });
});
