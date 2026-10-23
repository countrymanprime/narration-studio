import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ConsentDialog } from './ConsentDialog';
import { recommended } from './components';
import { ANALYSIS_TOOLS } from './fixtures';

const meta = {
  title: 'Settings/ConsentDialog',
  component: ConsentDialog,
  args: { tools: [ANALYSIS_TOOLS[0]], cancel: fn(), download: fn() },
} satisfies Meta<typeof ConsentDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// One tool (docs/research/mockups/studio-next/src/ui/ComponentConsent.tsx): its size, what it does, where it downloads from, what it
// needs and takes, and its licence. Download has focus; nothing downloads before it is pressed.
export const OneTool: Story = {
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole('dialog', { name: 'Download GLiNER' });
    await expect(within(dialog).getByText('Downloads from')).toBeTruthy();
    await expect(args.download).not.toHaveBeenCalled();
  },
};

// The pair the host recommends, offered together, with the total download.
export const TwoTools: Story = {
  args: { tools: recommended(ANALYSIS_TOOLS) },
};
