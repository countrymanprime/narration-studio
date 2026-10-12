import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ApiProvider } from '../../../../api/ApiContext';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { CHAPTERS, chapterHost } from './chapterFixtures';
import { ChapterList } from './ChapterList';

// The mock's chapter list (`ChapterList.tsx`): a prep dot per chapter, the "?" pill where a query is open, the chapter in view
// marked, and the key to the dots. The host is the browser mock, as the Delivery stories use it; the list reads prep and marks
// through the Script page's hooks.
const meta = {
  title: 'Script/ChapterList',
  component: ChapterList,
  args: { chapters: CHAPTERS, currentId: 'c1', onJump: fn() },
  decorators: [
    (Story, { parameters }) => (
      <ApiProvider api={parameters.api ?? chapterHost()}>
        <StudioProvider>
          <div className="max-w-[22rem]">
            <Story />
          </div>
        </StudioProvider>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof ChapterList>;

export default meta;
type Story = StoryObj<typeof meta>;

// Not started, in progress and prepped side by side, one chapter with an open query, and the current chapter marked.
export const AllStates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTitle('Open queries')).toBeTruthy();
    await expect(canvas.getAllByRole('img', { name: 'Prepped' }).length).toBeGreaterThan(0);
  },
};

export const NothingStarted: Story = { parameters: { api: chapterHost({}, []) } };

// The drawer at narrow widths: a close button, and a jump closes it.
export const Drawer: Story = {
  args: { onClose: fn() },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: /Chapter 3/ }));
    await expect(args.onJump).toHaveBeenCalledWith('c3');
    await expect(args.onClose).toHaveBeenCalled();
  },
};
