import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { ManuscriptSection } from './ManuscriptSection';

const api = createMockApi();
const data = await api.bootstrap();

const meta = {
  title: 'Settings/ManuscriptSection',
  component: ManuscriptSection,
  args: { data, go: () => {}, notify: () => {}, refreshBootstrap: async () => {} },
  decorators: [
    (Story) => (
      <ApiProvider api={api}>
        <div className="max-w-[860px] text-sm">
          <Story />
        </div>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof ManuscriptSection>;

export default meta;
type Story = StoryObj<typeof meta>;

// A manuscript exists: the one place to replace it.
export const WithManuscript: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Replace manuscript' })).toBeTruthy();
  },
};

// None yet: the same button imports the first one.
export const NoManuscript: Story = {
  args: { data: { ...data, manuscript: null } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Import manuscript' })).toBeTruthy();
  },
};
