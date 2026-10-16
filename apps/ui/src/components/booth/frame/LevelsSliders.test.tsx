// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawMonitorLevel } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { defaultKeymap } from '../../../input/keymap';
import type { NarrationApi } from '../../../types';
import { BoothFooter } from './BoothFooter';

afterEach(cleanup);

// The Levels menu's two sliders (the Studio Next mock's MicPop): Input level and Monitor level (output), 0 to 100. No DAW the app talks to can set an
// audio interface's input gain, so that slider is off and says so in the capability's own sentence; the monitor level is the DAW's.
function menu(over: Partial<NarrationApi> = {}, setup: keyof typeof DAW_SETUPS = 'reaper') {
  const calls: string[] = [];
  const api = createMockApi({
    dawMonitorLevel: async (): Promise<DawMonitorLevel> => (calls.push('read'), { ok: true, level: 60, message: '' }),
    dawSetMonitorLevel: async (level: number): Promise<DawMonitorLevel> => (calls.push(`set ${level}`), { ok: true, level, message: '' }),
    ...over,
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
          reachable: true,
          device: 'USB Mic',
          onDevice: vi.fn(),
          levels: { monitor: caps.monitor_level, input: caps.input_level },
        }}
        roomTone="Room tone −58 dBFS"
        keymap={defaultKeymap()}
      />
    </ApiProvider>,
  );
  return { calls, open: () => userEvent.click(screen.getByRole('button', { name: 'Levels' })) };
}
const popup = () => screen.getByRole('dialog', { name: 'Levels' });

describe('the Levels menu sliders', () => {
  it("shows Input level off with the capability's sentence, and Monitor level at the level the DAW holds", async () => {
    const { open } = menu();
    await open();
    const input = within(popup()).getByRole('slider', { name: 'Input level' });
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect(within(popup()).getByText("REAPER cannot set an audio interface's input gain. Set it in your interface's own control panel.")).toBeTruthy();
    const monitor = await within(popup()).findByRole('slider', { name: 'Monitor level (output)' });
    await waitFor(() => expect((monitor as HTMLInputElement).value).toBe('60'));
    expect((monitor as HTMLInputElement).disabled).toBe(false);
    expect(within(popup()).getByText('60')).toBeTruthy();
  });

  it('moving the monitor slider by keyboard sends the level the DAW then holds', async () => {
    const { open, calls } = menu();
    await open();
    const monitor = await within(popup()).findByRole('slider', { name: 'Monitor level (output)' });
    await waitFor(() => expect((monitor as HTMLInputElement).value).toBe('60'));
    act(() => monitor.focus());
    fireEvent.keyDown(monitor, { key: 'ArrowRight' });
    await waitFor(() => expect(calls).toContain('set 61'));
    expect(calls.filter((c) => c.startsWith('set'))).toEqual(['set 61']);
  });

  it("a DAW that cannot be asked leaves Monitor level off with the DAW's sentence, and no call is made to set it", async () => {
    const { open, calls } = menu({}, 'reaper-off');
    await open();
    expect((within(popup()).getByRole('slider', { name: 'Monitor level (output)' }) as HTMLInputElement).disabled).toBe(true);
    expect(within(popup()).getByText(/REAPER is not answering/)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('a refused change puts the slider back and says why in an alert', async () => {
    const { open } = menu({
      dawSetMonitorLevel: async () => ({ ok: false, level: 0, message: 'REAPER has no hardware output to set.' }),
    });
    await open();
    const monitor = await within(popup()).findByRole('slider', { name: 'Monitor level (output)' });
    await waitFor(() => expect((monitor as HTMLInputElement).value).toBe('60'));
    act(() => monitor.focus());
    fireEvent.keyDown(monitor, { key: 'ArrowRight' });
    const alert = await within(popup()).findByRole('alert');
    expect(alert.textContent).toBe('REAPER has no hardware output to set.');
    const slider = within(popup()).getByRole('slider', { name: 'Monitor level (output)' }) as HTMLInputElement;
    expect(slider.value).toBe('60');
    // Still usable (walkthrough 5): the next press sends again.
    expect(slider.disabled).toBe(false);
  });

  it('a very long sentence from the DAW wraps instead of widening the menu', async () => {
    const long = `REAPER ${'x'.repeat(300)} cannot set the level`;
    const { open } = menu({ dawMonitorLevel: async () => ({ ok: false, level: 0, message: long }) });
    await open();
    const note = await within(popup()).findByRole('alert');
    expect(note.textContent).toBe(long);
    expect(note.className).toContain('[overflow-wrap:anywhere]');
  });

  it('the built-in recorder has no sliders to move: both are off with their sentences', async () => {
    const { open, calls } = menu({}, 'builtin');
    await open();
    for (const name of ['Input level', 'Monitor level (output)']) {
      expect((within(popup()).getByRole('slider', { name }) as HTMLInputElement).disabled).toBe(true);
    }
    expect(calls).toEqual([]);
  });
});
