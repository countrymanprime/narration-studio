import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { BoothSidePanel } from './BoothSidePanel';
import { garden, queen, sideData } from './fixture';

const meta = {
  title: 'Booth/BoothSidePanel',
  component: BoothSidePanel,
  args: { data: sideData(), open: true, drawer: false, onOpenChange: () => undefined },
  decorators: [
    (Story) => (
      <ApiProvider api={createMockApi()}>
        <div className="relative flex h-[34rem] justify-end bg-[var(--bg)]">
          <Story />
        </div>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof BoothSidePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sections: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Voices in this scene')).toBeTruthy();
    await expect(canvas.getByText('Coming up')).toBeTruthy();
    await expect(canvas.getByText('This session')).toBeTruthy();
  },
};

export const ReferenceCharacter: Story = {
  args: { data: sideData({ reference: { entry: queen } }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('How they talk')).toBeTruthy();
  },
};

export const ReferencePlace: Story = { args: { data: sideData({ reference: { entry: garden } }) } };

export const ReferenceNote: Story = {
  args: { data: sideData({ reference: { note: { name: 'Stress', quote: 'Garden', messages: [{ text: 'lean on it' }, { who: 'Author', text: 'yes' }] } } }) },
};

export const Drawer: Story = { args: { drawer: true } };

export const DrawerClosed: Story = { args: { drawer: true, open: false } };
