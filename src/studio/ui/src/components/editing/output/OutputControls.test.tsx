// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OUTPUT, type OutputPrefs } from '../../engine/outputPrefs';
import { MonitorRow, OutputControls, type OutputControlsProps } from './OutputControls';
import type { DeviceListing } from './useOutputDevices';

afterEach(cleanup);

const ready = (labels: string[]): DeviceListing => ({
  phase: 'ready',
  checkedAt: 0,
  status: 'ok',
  outputs: labels.map((label) => ({ id: label, label })),
});

function Host(props: Partial<OutputControlsProps> & { start?: Partial<OutputPrefs>; onChangeSpy?: (patch: Partial<OutputPrefs>) => void }) {
  const [prefs, setPrefs] = useState<OutputPrefs>({ ...DEFAULT_OUTPUT, ...props.start });
  return (
    <OutputControls
      prefs={prefs}
      onChange={(patch) => {
        props.onChangeSpy?.(patch);
        setPrefs((p) => ({ ...p, ...patch }));
      }}
      devices={props.devices ?? ready(['Studio monitors', 'Headphones'])}
      deviceProblem={props.deviceProblem ?? null}
      onCheckDevices={props.onCheckDevices ?? (() => {})}
    >
      {props.children}
    </OutputControls>
  );
}
const openOutput = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Show volume and output device' }));
  return screen.findByRole('dialog', { name: 'Output' });
};

describe('the bar controls', () => {
  it('is one labelled group of two pressable buttons: silence and the Output popover', () => {
    render(<Host />);
    const group = screen.getByRole('group', { name: 'Output' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Silence output', 'Show volume and output device']);
  });

  it('silence is a toggle that reports its state', async () => {
    const onChangeSpy = vi.fn();
    render(<Host onChangeSpy={onChangeSpy} />);
    const mute = screen.getByRole('button', { name: 'Silence output' });
    expect(mute.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(mute);
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(onChangeSpy).toHaveBeenLastCalledWith({ muted: true });
    await userEvent.click(mute);
    expect(mute.getAttribute('aria-pressed')).toBe('false');
  });

  it('writes a speed other than 1× beside the buttons and nothing at 1×', () => {
    const view = render(<Host />);
    expect(within(screen.getByRole('group', { name: 'Output' })).queryByText(/×/)).toBeNull();
    view.unmount();
    render(<Host start={{ rate: 1.25 }} />);
    expect(within(screen.getByRole('group', { name: 'Output' })).getByText('1.25×')).toBeTruthy();
  });
});

describe('the Output popover', () => {
  it('has the five speeds as a group of toggles, the current one pressed, and a pick changes it', async () => {
    const onChangeSpy = vi.fn();
    render(<Host onChangeSpy={onChangeSpy} start={{ rate: 1.25 }} />);
    const dialog = await openOutput();
    const speeds = within(within(dialog).getByRole('group', { name: 'Speed' })).getAllByRole('button');
    expect(speeds.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['0.75×', 'false'],
      ['1×', 'false'],
      ['1.25×', 'true'],
      ['1.5×', 'false'],
      ['2×', 'false'],
    ]);
    await userEvent.click(speeds[3]);
    expect(onChangeSpy).toHaveBeenCalledWith({ rate: 1.5 });
    expect(speeds[3].getAttribute('aria-pressed')).toBe('true');
  });

  it('has the volume as a slider with its percent, moved by the keyboard', async () => {
    const onChangeSpy = vi.fn();
    render(<Host onChangeSpy={onChangeSpy} start={{ volume: 50 }} />);
    const dialog = await openOutput();
    const slider = within(dialog).getByRole('slider', { name: 'Volume' });
    expect(slider.getAttribute('aria-valuetext')).toBe('50%');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.change(slider, { target: { value: '60' } });
    expect(onChangeSpy).toHaveBeenCalledWith({ volume: 60 });
  });

  it('lists the system default first, then the outputs, and picks by name', async () => {
    const onChangeSpy = vi.fn();
    render(<Host onChangeSpy={onChangeSpy} />);
    const dialog = await openOutput();
    const select = within(dialog).getByRole('combobox', { name: 'Output device' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['System default', 'Studio monitors', 'Headphones']);
    await userEvent.selectOptions(select, 'Headphones');
    expect(onChangeSpy).toHaveBeenCalledWith({ device: 'Headphones' });
  });

  it('keeps a saved output that is not connected chosen and offers Check again', async () => {
    const onCheckDevices = vi.fn();
    render(<Host start={{ device: 'Old interface' }} onCheckDevices={onCheckDevices} />);
    const dialog = await openOutput();
    expect((within(dialog).getByRole('combobox', { name: 'Output device' }) as HTMLSelectElement).value).toBe('Old interface');
    expect(within(dialog).getByRole('option', { name: 'Old interface (not connected)' })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check again' }));
    expect(onCheckDevices).toHaveBeenCalledOnce();
  });

  it('says it is listing, with the choice off, while the outputs load', async () => {
    render(<Host devices={{ phase: 'loading' }} />);
    const dialog = await openOutput();
    expect((within(dialog).getByRole('combobox', { name: 'Output device' }) as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).getByText('Listing outputs…')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Check again' })).toBeNull();
  });

  it('turns the choice off with a sentence and a way out when the computer lists no outputs', async () => {
    render(<Host devices={{ phase: 'ready', checkedAt: 0, status: 'unavailable', message: 'x' }} start={{ device: 'Gone' }} />);
    const dialog = await openOutput();
    expect((within(dialog).getByRole('combobox', { name: 'Output device' }) as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).getByRole('alert').textContent).toMatch(/would not list its outputs/);
    expect(within(dialog).getByRole('button', { name: 'Check again' })).toBeTruthy();
  });

  it('shows why the chosen output could not be used', async () => {
    render(<Host deviceProblem="Could not play on Headphones. Playing on the system default until it is back." start={{ device: 'Headphones' }} />);
    const dialog = await openOutput();
    expect(within(dialog).getByRole('alert').textContent).toContain('Could not play on Headphones');
  });

  it('keeps a very long, emoji and right-to-left output name whole in the list', async () => {
    const names = ['Realtek High Definition Audio (Digital Output Optical S/PDIF) — USB Audio CODEC 🎧 سماعات'.repeat(2), 'مكبر الصوت'];
    render(<Host devices={ready(names)} start={{ device: names[1] }} />);
    const dialog = await openOutput();
    const select = within(dialog).getByRole('combobox', { name: 'Output device' });
    expect((select as HTMLSelectElement).value).toBe(names[1]);
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toContain(names[0]);
  });

  it('closes on Escape and gives focus back to its button', async () => {
    render(<Host />);
    await openOutput();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Output' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show volume and output device' }));
  });
});

describe('MonitorRow', () => {
  const level = (state: Parameters<typeof MonitorRow>[0]['daw']['level']) => {
    const onLevel = vi.fn();
    render(<MonitorRow daw={{ name: 'REAPER', level: state, onLevel }} />);
    return onLevel;
  };

  it('is off while the first read is out', () => {
    level({ kind: 'loading' });
    expect((screen.getByRole('slider', { name: 'REAPER monitor level' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Reading the level from REAPER…')).toBeTruthy();
  });

  it('sets the DAW level and says it is not this player', () => {
    const onLevel = level({ kind: 'ready', level: 70, saving: false });
    const slider = screen.getByRole('slider', { name: 'REAPER monitor level' });
    expect((slider as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText(/does not change this player/)).toBeTruthy();
    fireEvent.change(slider, { target: { value: '80' } });
    expect(onLevel).toHaveBeenCalledWith(80);
  });

  it('shows the DAW refusal as an alert with the slider off and a dash for a level it never gave', () => {
    level({ kind: 'off', message: 'REAPER has no hardware output on the master.', level: null });
    expect((screen.getByRole('slider', { name: 'REAPER monitor level' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('REAPER has no hardware output on the master.');
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('keeps the last confirmed level usable with the reason a change did not take', () => {
    level({ kind: 'ready', level: 55, saving: false, problem: 'The monitor level could not be changed: timed out' });
    expect((screen.getByRole('slider', { name: 'REAPER monitor level' }) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('could not be changed');
  });
});
