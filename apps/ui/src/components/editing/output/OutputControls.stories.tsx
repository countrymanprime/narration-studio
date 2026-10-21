import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { expect, fn, within } from 'storybook/test';
import { DEFAULT_OUTPUT, deviceProblem, type OutputPrefs } from '../../engine/outputPrefs';
import { LevelMeter } from '../../primitives/LevelMeter';
import { MonitorRow, OutputControls } from './OutputControls';
import type { DeviceListing } from './useOutputDevices';

// The group sits at the left of the Editing page's transport bar, on `--surface` (the bar's own ground), so axe measures contrast there.
// Controlled like the page: the story feeds each change back in. The popover opens at first (`defaultOpen`) to draw the state it shows.
function Bar(props: Omit<ComponentProps<typeof OutputControls>, 'prefs' | 'onChange'> & { start?: Partial<OutputPrefs> }) {
  const [prefs, setPrefs] = useState<OutputPrefs>({ ...DEFAULT_OUTPUT, ...props.start });
  return (
    <div className="flex min-h-80 w-[34rem] max-w-full items-start border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2">
      <OutputControls {...props} prefs={prefs} onChange={(patch) => setPrefs((p) => ({ ...p, ...patch }))} />
    </div>
  );
}

const outputs = (labels: string[]): DeviceListing => ({ phase: 'ready', checkedAt: 0, status: 'ok', outputs: labels.map((label) => ({ id: label, label })) });

const meta = {
  title: 'Editing/OutputControls',
  component: Bar,
  args: {
    devices: outputs(['Speakers (Realtek)', 'Headphones (Focusrite USB Audio)']),
    deviceProblem: null,
    onCheckDevices: fn(),
  },
} satisfies Meta<typeof Bar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What the bar shows with the popover closed: silence and the Output button. */
export const Closed: Story = {
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole('group', { name: 'Output' });
    await expect(within(group).getAllByRole('button')).toHaveLength(2);
  },
};

/** Silenced, at 0.75×: the speed is written beside the buttons whenever it is not 1×. */
export const SilencedAndSlow: Story = { args: { start: { muted: true, rate: 0.75 } } };

/** The speed, the volume and the output device: the system default, then the outputs the computer names. */
export const VolumeAndDevice: Story = { args: { defaultOpen: true, start: { volume: 80 } } };

export const ListingOutputs: Story = { args: { defaultOpen: true, devices: { phase: 'loading' } } };

/** The computer gave no named outputs (or this webview cannot choose one): the choice is off, with a way to try again. */
export const NoOutputsListed: Story = {
  args: { defaultOpen: true, devices: { phase: 'ready', checkedAt: 0, status: 'unavailable', message: '' } },
};

/** A saved output that is unplugged stays chosen and says so; the sound plays on the system default until it is back. */
export const SavedOutputNotConnected: Story = { args: { defaultOpen: true, start: { device: 'Studio monitors (USB)' } } };

export const OutputRefused: Story = {
  args: { defaultOpen: true, start: { device: 'Headphones (Focusrite USB Audio)' }, deviceProblem: deviceProblem('Headphones (Focusrite USB Audio)') },
};

/** Names the audio system gives are long, in any script, and sometimes carry emoji. */
export const LongAndForeignNames: Story = {
  args: {
    defaultOpen: true,
    devices: outputs(['Realtek High Definition Audio (Digital Output Optical S/PDIF) via USB Audio CODEC Hub, port 3', 'مكبرات الصوت (USB) 🎧']),
    start: { device: 'مكبرات الصوت (USB) 🎧' },
  },
};

const withDaw = (level: ComponentProps<typeof MonitorRow>['daw']['level']): { defaultOpen: boolean; children: ReactNode } => ({
  defaultOpen: true,
  children: <MonitorRow daw={{ name: 'REAPER', level, onLevel: fn() }} />,
});

/** With a DAW that can set its monitor level: its own output, which this player does not use. */
export const DawMonitorLevel: Story = { args: withDaw({ kind: 'ready', level: 70, saving: false }) };

export const DawMonitorReading: Story = { args: withDaw({ kind: 'loading' }) };

/** The DAW answered with its own sentence; the slider is off and the sentence is the exit. */
export const DawMonitorRefused: Story = { args: withDaw({ kind: 'off', message: 'REAPER has no hardware output on the master track.', level: null }) };

/** A change did not reach the DAW: the last level it confirmed stays, usable, with the reason. */
export const DawMonitorFailed: Story = {
  args: withDaw({ kind: 'ready', level: 55, saving: false, problem: 'The monitor level could not be changed: REAPER did not answer.' }),
};

/**
 * SAMPLE, not wired. A loudness and peak readout of what the player outputs needs the player's audio routed through an analyser
 * (docs/design/editing-output-audio.md, "Not built"); the page does not draw it. This shows the row it would be: a meter and its two numbers.
 */
export const SampleLoudnessReadout: Story = {
  args: {
    defaultOpen: true,
    children: (
      <div className="flex flex-col gap-1.5 rounded border border-dashed border-[var(--line-strong)] p-2">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Sample, not built: level of this sound</span>
        <LevelMeter label="Output level" peak={-6.5} rms={-21.4} size="regular" />
        <span className="font-mono text-[13px]">Peak −6.5 dBFS · RMS −21.4 dBFS</span>
      </div>
    ),
  },
};
