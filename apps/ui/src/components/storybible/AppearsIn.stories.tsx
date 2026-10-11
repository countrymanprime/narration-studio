import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { AppearsIn } from './AppearsIn';

const manuscript = [
  { id: 'c1', title: 'Chapter One', subtitle: 'The Arrival' },
  { id: 'c2', title: 'Chapter Two' },
  { id: 'c3', title: 'Chapter Three', subtitle: 'A very long subtitle that has to wrap on a narrow detail pane' },
];
const at = (...ids: string[]) => ({ appearances: ids.map((chapterId, sceneIndex) => ({ chapterId, chapter: chapterId, sceneIndex })) });

const meta = {
  title: 'Story Bible/AppearsIn',
  component: AppearsIn,
  args: { manuscript, onGo: () => {}, entity: at('c1') },
} satisfies Meta<typeof AppearsIn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneChapter: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Appears in · 1 chapter')).toBeTruthy();
  },
};

export const ManyChapters: Story = {
  args: { entity: at('c1', 'c2', 'c3') },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('button')).toHaveLength(3);
  },
};

export const None: Story = {
  args: { entity: { appearances: [] } },
};

export const NotListedYet: Story = {
  args: { entity: {} },
};
