// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilitySupport, DawMeters, DawMonitorLevel } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { defaultKeymap } from '../../../input/keymap';
import type { NarrationApi } from '../../../types';
import { BoothFooter } from './BoothFooter';
import { DAW_METERS_EVERY_MS, DAW_METERS_QUIET_MS } from './useDawMeters';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The DAW's own meters under the Levels menu's sliders (#2251 item 11): the record-armed track's input under Input level, the output under
// Monitor level, read while the menu is open. The meters only read, so they are Supported and on by default (the owner's decision on #2251);
// only the monitor slider, which writes, keeps a way to turn Experimental on.

const ON: DawCapabilitySupport = { level: 'experimental', available: true };
const METERS_ON: DawCapabilitySupport = { level: 'supported', available: true };
const METERS_TURNED_OFF: DawCapabilitySupport = { level: 'supported', available: false, reason: 'turned_off', message: 'Turned off in Settings.' };
const EXPERIMENTAL_OFF: DawCapabilitySupport = {
  level: 'experimental',
  available: false,
  reason: 'experimental_off',
  message: 'Experimental: switched off in Settings.',
};
const ARMED: DawMeters = { ok: true, output: -18, input: -24, inputTrack: 'Chapter 1 Narration', message: '', reason: '' };

function menu(
  answers: () => DawMeters | Promise<DawMeters>,
  { meters = METERS_ON, monitor = ON, reachable = true }: { meters?: DawCapabilitySupport; monitor?: DawCapabilitySupport; reachable?: boolean } = {},
  setup: keyof typeof DAW_SETUPS = 'reaper',
) {
  const reads: number[] = [];
  const onOpenSettings = vi.fn();
  const api = createMockApi({
    dawMonitorLevel: async (): Promise<DawMonitorLevel> => ({ ok: true, level: 60, message: '' }),
    dawMeters: async () => (reads.push(Date.now()), answers()),
  } as Partial<NarrationApi>);
  const caps = DAW_SETUPS[setup].capabilities;
  render(
    <ApiProvider api={api}>
      <BoothFooter
        record={<button>Record</button>}
        seconds={0}
        recording={false}
        mic={{
          engine: 'daw',
          dawName: 'REAPER',
          reachable,
          device: 'USB Mic',
          onDevice: vi.fn(),
          levels: { monitor, input: caps.input_level, meters, onOpenSettings },
        }}
        roomTone="Room not measured yet"
        keymap={defaultKeymap()}
      />
    </ApiProvider>,
  );
  return {
    reads,
    onOpenSettings,
    open: () => userEvent.click(screen.getByRole('button', { name: 'Levels' })),
    close: () => userEvent.keyboard('{Escape}'),
  };
}
const popup = () => screen.getByRole('dialog', { name: 'Levels' });
const meter = (name: string) => within(popup()).getByRole('meter', { name });

describe("the DAW's meters in the Levels menu", () => {
  it('shows the armed track input and the output in dBFS, and names the track the input is heard on', async () => {
    const { open } = menu(() => ARMED);
    await open();
    await waitFor(() => expect(meter('REAPER input level').getAttribute('aria-valuenow')).toBe('-24'));
    expect(meter('REAPER output level').getAttribute('aria-valuenow')).toBe('-18');
    expect(within(popup()).getByText('Heard on “Chapter 1 Narration” in REAPER.')).toBeTruthy();
    // The input slider stays off with its reason: a meter is not a way to set the interface's gain.
    expect((within(popup()).getByRole('slider', { name: 'Input level' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('says no track is armed instead of showing silence as an input level, and still shows the output', async () => {
    const { open } = menu(() => ({ ...ARMED, input: null, inputTrack: '' }));
    await open();
    expect(await within(popup()).findByText('No track is armed in REAPER: its input level shows once one is.')).toBeTruthy();
    expect(meter('REAPER input level').getAttribute('aria-valuetext')).toBe('silent');
    await waitFor(() => expect(meter('REAPER output level').getAttribute('aria-valuenow')).toBe('-18'));
  });

  it('follows the DAW: reads again while open, one read at a time, and stops when the menu closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let level = -40;
    let release: (() => void) | null = null;
    const { open, close, reads } = menu(async () => {
      if (reads.length === 3) await new Promise<void>((resolve) => (release = resolve));
      return { ...ARMED, input: level };
    });
    await open();
    await waitFor(() => expect(meter('REAPER input level').getAttribute('aria-valuenow')).toBe('-40'));
    level = -12;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DAW_METERS_EVERY_MS);
    });
    await waitFor(() => expect(reads.length).toBeGreaterThanOrEqual(2));
    // A read that hangs is never doubled: ticks pass while the third read waits.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DAW_METERS_EVERY_MS * 3);
    });
    expect(reads.length).toBe(3);
    await act(async () => release?.());
    await close();
    const after = reads.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DAW_METERS_EVERY_MS * 8);
    });
    expect(reads.length).toBe(after);
  });

  it('a DAW that goes quiet is shown as quiet, with when it was last heard, not as the last level', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let hang = false;
    const { open } = menu(() => (hang ? new Promise<DawMeters>(() => {}) : ARMED));
    await open();
    await waitFor(() => expect(meter('REAPER input level').getAttribute('aria-valuenow')).toBe('-24'));
    hang = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DAW_METERS_QUIET_MS + 2 * DAW_METERS_EVERY_MS);
    });
    expect(await within(popup()).findByText(/^Can't tell: the DAW's levels were last heard \d+ s ago\.$/)).toBeTruthy();
    expect(meter('REAPER input level').getAttribute('aria-valuetext')).toBe('silent');
  });

  it("a refusal is written in the DAW's own sentence under the input meter", async () => {
    const { open } = menu(() => ({ ok: false, output: 0, input: null, inputTrack: '', message: 'This REAPER version cannot read its meters.', reason: '' }));
    await open();
    expect(await within(popup()).findByText('This REAPER version cannot read its meters.')).toBeTruthy();
  });

  it('with the meters turned off, says why once and reads nothing', async () => {
    const { open, reads } = menu(() => ARMED, { meters: METERS_TURNED_OFF });
    await open();
    expect(within(popup()).getByText('REAPER’s own input and output levels: Turned off in Settings.')).toBeTruthy();
    expect(within(popup()).queryByRole('meter', { name: 'REAPER input level' })).toBeNull();
    expect(reads).toEqual([]);
  });

  it("shows the meters with Experimental off: the one Turn on in Settings is the monitor slider's", async () => {
    const { open, onOpenSettings } = menu(() => ARMED, { monitor: EXPERIMENTAL_OFF });
    await open();
    expect(await within(popup()).findByText('Heard on “Chapter 1 Narration” in REAPER.')).toBeTruthy();
    expect(meter('REAPER output level')).toBeTruthy();
    const buttons = within(popup()).getAllByRole('button', { name: 'Turn on in Settings' });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('never offers a switch for the meters, even from a host that still says Experimental keeps them off', async () => {
    const { open } = menu(() => ARMED, { meters: EXPERIMENTAL_OFF });
    await open();
    expect(within(popup()).getByText('REAPER’s own input and output levels: Experimental: switched off in Settings.')).toBeTruthy();
    expect(within(popup()).queryByRole('button', { name: 'Turn on in Settings' })).toBeNull();
  });

  it('offers no way to turn Experimental on while the DAW is not answering: turning it on would not help', async () => {
    const { open } = menu(() => ARMED, { meters: EXPERIMENTAL_OFF, monitor: EXPERIMENTAL_OFF, reachable: false });
    await open();
    expect(within(popup()).queryByRole('button', { name: 'Turn on in Settings' })).toBeNull();
  });

  it('offers no way to turn on what Experimental does not keep off', async () => {
    const turnedOff: DawCapabilitySupport = { level: 'experimental', available: false, reason: 'turned_off', message: 'Turned off in Settings.' };
    const { open } = menu(() => ARMED, { meters: turnedOff, monitor: { ...turnedOff } }, 'reaper');
    await open();
    expect(within(popup()).queryByRole('button', { name: 'Turn on in Settings' })).toBeNull();
  });

  it('a track name with emoji and right-to-left text wraps inside the menu', async () => {
    const name = `Ch 1 “Alice” 🎙 فصل ${'x'.repeat(200)}`;
    const { open } = menu(() => ({ ...ARMED, inputTrack: name }));
    await open();
    const line = await within(popup()).findByText(`Heard on “${name}” in REAPER.`);
    expect(line.className).toContain('[overflow-wrap:anywhere]');
  });
});
