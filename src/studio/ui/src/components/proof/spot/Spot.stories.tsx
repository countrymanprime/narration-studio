import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import type { PassageTake, WorkspaceTakesResult } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { spotOf } from './spot';
import { SpotTakes } from './SpotTakes';
import { TakeLanes } from './TakeLanes';
import { TakesBadge } from './TakesBadge';

// Takes at a flagged spot on Proof (Studio Next mock: pages/proof/TakeLanes.tsx, Inspector.tsx's SpotTakes, NotesTable.tsx's badge). Read-only.
const take = (id: string, over: Partial<PassageTake> = {}): PassageTake => ({
  id,
  source: 'item_take',
  action: 'make_active',
  confirm: false,
  label: id,
  detail: '',
  active: false,
  itemGuid: 'g',
  takeGuid: id,
  sourceFile: `${id}.wav`,
  sourceStart: 0,
  sourceLength: 6,
  usable: true,
  compared: false,
  ...over,
});
const read = (candidates: PassageTake[]): WorkspaceTakesResult => ({
  chapterId: 'c1',
  firstToken: 0,
  lastToken: 6,
  firstParagraph: 0,
  lastParagraph: 0,
  words: 7,
  passageId: 'p1',
  itemGuid: 'g',
  candidates,
});
const context = { script: 'I could not help it at all', at: 12, heard: 'I could not help myself at all' };
const threeKept = spotOf(read([take('a', { sourceLength: 5 }), take('b', { active: true, sourceLength: 7 }), take('c', { sourceLength: 4 })]), context);
const withHidden = spotOf(
  read([take('a'), take('b', { active: true }), take('c', { usable: false, reason: 'This item is not in the saved project.' })]),
  context,
);
const noSource = spotOf(read([take('a', { sourceFile: '', usable: false, reason: 'The item is not live.' }), take('b', { active: true })]), context);
const oneTake = spotOf(read([take('a', { active: true })]), context);

const meta = {
  title: 'Proof/Spot takes',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <ApiProvider api={createMockApi()}>
        <div className="max-w-sm bg-[var(--surface)] p-3">
          <Story />
        </div>
      </ApiProvider>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Badge: Story = {
  render: () => (
    <span className="text-sm">
      I could not help myself
      <TakesBadge count={3} />
    </span>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('3 takes at this spot')).toBeTruthy();
  },
};

export const LanesThreeTakesOneKept: Story = { render: () => <TakeLanes spot={threeKept} winStart={0} winLen={30} /> };
export const LanesWithHiddenTake: Story = { render: () => <TakeLanes spot={withHidden} winStart={0} winLen={30} /> };
export const LanesOneTakeDrawsNothing: Story = {
  render: () => (
    <>
      <TakeLanes spot={oneTake} winStart={0} winLen={30} />
      <p className="text-sm">No lanes at a one-take spot.</p>
    </>
  ),
};

export const SectionThreeTakesOneKept: Story = {
  render: () => <SpotTakes spot={threeKept} onOpenInEditing={fn()} />,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await expect(view.getByRole('heading', { name: 'Takes at this spot · 3' })).toBeTruthy();
    await expect(view.getByRole('button', { name: 'Manage takes in Editing' })).toBeTruthy();
  },
};
export const SectionWithHiddenTake: Story = { render: () => <SpotTakes spot={withHidden} onOpenInEditing={fn()} /> };
export const SectionNoSourceAudio: Story = { render: () => <SpotTakes spot={noSource} onOpenInEditing={fn()} /> };
export const SectionRefused: Story = { render: () => <SpotTakes spot={null} refusal="Takes are not available for this DAW." onOpenInEditing={fn()} /> };
