import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ChoosableDaw, DawCapabilitySupport, DawChoice } from '../../../api/contracts/daw';
import { RecordingPanelView, type RecordingPanelViewProps } from './RecordingPanel';

const OFF: DawCapabilitySupport = { level: 'experimental', available: false, reason: 'experimental_off', message: 'Experimental: switched off in Settings.' };
const AUDACITY: DawCapabilitySupport = {
  level: 'not_yet_available',
  available: false,
  reason: 'not_yet',
  message:
    "Audacity support is not available yet. This version can't read audio from Audacity or add labels to it, so open the project from REAPER to compare it.",
};

// The host's answer for a folder holding one .rpp (tests/fixtures/contracts/daw-choice-found.json), varied per story.
const found: DawChoice = {
  hasProject: true,
  daw: 'REAPER',
  source: 'found',
  chosen: null,
  state: 'not_linked',
  reachable: false,
  linkedFile: null,
  foundFiles: ['Alice.rpp'],
  launcherAutoStart: false,
  experimental: false,
  options: [
    { daw: 'REAPER', installed: true, record: OFF },
    { daw: 'Audacity', installed: null, record: AUDACITY },
    { daw: 'Built-in', installed: true, record: OFF },
  ],
};

// The choice is held here, as RecordingPanel holds the host's answer.
function Choosing(props: RecordingPanelViewProps) {
  const [choice, setChoice] = useState(props.choice);
  return (
    <RecordingPanelView
      {...props}
      choice={choice}
      onChoose={(next: ChoosableDaw) => {
        props.onChoose(next);
        if (choice) setChoice({ ...choice, daw: next, chosen: next, source: 'chosen', state: next === 'Built-in' ? 'app' : choice.state });
      }}
    />
  );
}

const meta = {
  title: 'Settings/Page/RecordingPanel',
  component: RecordingPanelView,
  args: { choice: found, onChoose: fn(), onLinkFound: fn(), onPickFile: fn(), onStart: fn() },
  render: (args) => <Choosing {...args} />,
  decorators: [
    (Story) => (
      <div className="max-w-[860px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RecordingPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

// A folder holding one .rpp: REAPER, not linked, the file offered in one click.
export const FoundNotLinked: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: /^REAPER\./ }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(canvas.getByRole('button', { name: 'Link Alice.rpp' }));
    await expect(args.onLinkFound).toHaveBeenCalled();
  },
};

export const SeveralFound: Story = { args: { choice: { ...found, foundFiles: ['Alice.rpp', 'Alice v2.rpp'] } } };

// Linked, REAPER not started from the app: Start connects it.
export const LinkedNotStarted: Story = { args: { choice: { ...found, source: 'linked', state: 'linked', linkedFile: 'Alice.rpp' } } };

export const Connected: Story = {
  args: {
    choice: {
      ...found,
      source: 'linked',
      state: 'connected',
      reachable: true,
      linkedFile: 'Alice.rpp',
      experimental: true,
      options: [
        { daw: 'REAPER', installed: true, record: { level: 'experimental', available: true } },
        { daw: 'Audacity', installed: null, record: AUDACITY },
        { daw: 'Built-in', installed: true, record: { level: 'experimental', available: true } },
      ],
    },
  },
};

export const NotRunning: Story = { args: { choice: { ...found, source: 'linked', state: 'not_running', linkedFile: 'Alice.rpp' } } };

export const NotInstalled: Story = {
  args: {
    choice: {
      ...found,
      source: 'chosen',
      chosen: 'REAPER',
      foundFiles: [],
      options: [{ daw: 'REAPER', installed: false, record: OFF }, ...found.options.slice(1)],
    },
  },
};

export const BuiltInChosen: Story = { args: { choice: { ...found, daw: 'Built-in', source: 'chosen', chosen: 'Built-in', state: 'app' } } };

export const ChoosesBuiltIn: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('radio', { name: /^Built-in recorder/ }));
    await expect(args.onChoose).toHaveBeenCalledWith('Built-in');
  },
};

// A REAPER launch of a project whose saved choice is the built-in recorder: the launch wins while it runs, and the panel says so.
export const LaunchOverrides: Story = {
  args: { choice: { ...found, source: 'launch', chosen: 'Built-in', state: 'connected', reachable: true, linkedFile: 'Alice.rpp' } },
};

export const Refused: Story = { args: { error: 'stop the take before changing how the project records' } };

export const Reading: Story = { args: { choice: undefined } };
