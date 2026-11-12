import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { defaultKeymap } from '../../../input/keymap';
import { BoothFooter } from './BoothFooter';
import { BoothTop } from './BoothTop';
import { ChosenStartChip } from '../resume/ChosenStartChip';

const withApi: Decorator = (Story) => (
  <ApiProvider api={createMockApi()}>
    <Story />
  </ApiProvider>
);

const record = <button className="rounded border px-3 py-1">Record</button>;
const mic = { engine: 'builtin' as const, dawName: 'REAPER', reachable: true, device: 'USB Mic', onDevice: fn() };

const meta = {
  title: 'Booth/Frame',
  component: BoothTop,
  decorators: [withApi],
  args: {
    progress: '¶ 38 of 71 · 41% · ~8:10 of audio left',
    recording: false,
    panelOpen: true,
    onTogglePanel: fn(),
    text: { font: 'Georgia', size: 40, onFont: fn(), onSize: fn() },
  },
} satisfies Meta<typeof BoothTop>;

export default meta;
type Story = StoryObj<typeof meta>;

// Ready to record: no Ready chip, no REC pill, no exit button; Esc Exit is a reminder in the footer.
export const Ready: Story = {
  render: (args) => (
    <div className="w-full">
      <BoothTop {...args} resume={<button className="text-sm">Resume at ¶ 38</button>} setup={<button className="text-sm">Built-in</button>} />
      <BoothFooter record={record} seconds={0} recording={false} mic={mic} roomTone="Room tone −58 dBFS" roomToneOk keymap={defaultKeymap()} />
    </div>
  ),
};

// A start is chosen and the side panel is closed: the readout stands above the footer's rim at the right, over the lowest 22 px of the text, and touches no control.
export const ChosenStart: Story = {
  args: { panelOpen: false },
  render: (args) => (
    <div className="w-full">
      <BoothTop {...args} />
      <div className="h-24 overflow-hidden px-6 py-2 font-serif text-3xl">
        She was considering in her own mind whether the pleasure of making a daisy-chain would be worth the trouble
      </div>
      <BoothFooter
        record={record}
        seconds={0}
        recording={false}
        mic={mic}
        roomTone="Room tone −58 dBFS"
        roomToneOk
        keymap={defaultKeymap()}
        start={<ChosenStartChip paragraph={3} />}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('[data-chosen-start]');
    await expect(chip).not.toBeNull();
    // Unit run: no layout, nothing to measure; in the browser the readout is above the footer and clear of Record.
    const box = chip!.closest('[role="group"]')!.getBoundingClientRect();
    const rec = within(canvasElement).getByRole('button', { name: 'Record' }).getBoundingClientRect();
    if (box.width > 0) await expect(box.bottom <= rec.top || box.right <= rec.left || box.left >= rec.right).toBe(true);
  },
};

// A take runs: the REC pill and the timer.
export const Recording: Story = {
  args: { recording: true },
  render: (args) => (
    <div className="w-full">
      <BoothTop {...args} />
      <BoothFooter
        record={<button className="rounded border px-3 py-1">Stop</button>}
        seconds={402}
        recording
        mic={mic}
        roomTone="Room tone −58 dBFS"
        roomToneOk
        keymap={defaultKeymap()}
      />
    </div>
  ),
};

// The DAW is not running: Record says why, and the Levels menu says the microphone is chosen in the DAW, which is off.
export const Refused: Story = {
  render: (args) => (
    <div className="w-full">
      <BoothTop {...args} />
      <BoothFooter
        record={
          <button disabled className="rounded border px-3 py-1">
            Record
          </button>
        }
        seconds={0}
        recording={false}
        why="REAPER is not running"
        mic={{ ...mic, engine: 'daw', reachable: false, offReason: 'REAPER is not running' }}
        roomTone="Room tone not measured yet"
        keymap={defaultKeymap()}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Record options' }));
    await expect((await within(document.body).findAllByText('REAPER is not running')).length).toBeGreaterThan(1);
  },
};

// At 1280 and below the side panel is a drawer; the toggle says so.
export const Drawer: Story = {
  parameters: { viewport: { defaultViewport: 'tablet' } },
  args: { panelOpen: false },
  render: (args) => <BoothTop {...args} />,
};

// The text popover: the reader font and the Booth size.
export const TextSettings: Story = {
  render: (args) => <BoothTop {...args} />,
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Text settings' }));
    const body = within(document.body);
    await expect(await body.findByText('40 px')).toBeTruthy();
    await userEvent.selectOptions(body.getByRole('combobox', { name: 'Font' }), 'Verdana');
    await expect(args.text?.onFont).toHaveBeenCalledWith('Verdana');
  },
};
