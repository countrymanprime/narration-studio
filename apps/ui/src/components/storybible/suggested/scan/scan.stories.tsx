import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { AnalysisPrompt } from './AnalysisPrompt';

// SN-X63: the body of "Scan the manuscript", the first-scan prompt. The mock page is pages/bible/startScan.tsx in the Studio Next mock. The
// dialog shell (title, Close, Escape, focus return) is the overlay's; SN-B8 wires the scan button to `useStartScan`.
const meta = { title: 'Story Bible/First-scan prompt', component: AnalysisPrompt, args: { choose: fn() } } satisfies Meta<typeof AnalysisPrompt>;
export default meta;
type Story = StoryObj<typeof meta>;

const Surface = (args: Parameters<typeof AnalysisPrompt>[0]) => (
  <div className="max-w-md rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
    <AnalysisPrompt {...args} />
  </div>
);

// Three ways forward, the first with focus, and the checkbox off.
export const ThreeWays: Story = {
  render: (args) => <Surface {...args} />,
  play: async ({ canvasElement, args }) => {
    const ui = within(canvasElement);
    await expect(ui.getByRole('button', { name: 'Use basic scan now' })).toHaveFocus();
    await expect(ui.getByRole('button', { name: 'Download better analysis…' })).toBeEnabled();
    await expect(ui.getByRole('button', { name: 'Import from a file instead' })).toBeEnabled();
    await expect(ui.getByRole('checkbox', { name: 'Don’t ask again' })).not.toBeChecked();
    await userEvent.click(ui.getByRole('button', { name: 'Use basic scan now' }));
    await expect(args.choose).toHaveBeenCalledWith('basic', false);
  },
};

// "Don't ask again" ticked: the choice carries it so it is saved before the action runs.
export const DontAskAgain: Story = {
  render: (args) => <Surface {...args} />,
  play: async ({ canvasElement, args }) => {
    const ui = within(canvasElement);
    await userEvent.click(ui.getByRole('checkbox', { name: 'Don’t ask again' }));
    await userEvent.click(ui.getByRole('button', { name: 'Import from a file instead' }));
    await expect(args.choose).toHaveBeenCalledWith('import', true);
  },
};
