import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { KpiRow } from './KpiRow';
import { FINISHED, MID_BOOK, NO_TAKE_LOG, NOTHING_RECORDED, overviewFor } from './overviewFixtures';

const meta = {
  title: 'Production/KpiRow',
  component: KpiRow,
  args: { ...overviewFor(MID_BOOK).kpi, onGo: fn() },
} satisfies Meta<typeof KpiRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// A book mid-way: every tile is a button that goes to its page.
export const MidWay: Story = {
  play: async ({ canvasElement, args }) => {
    within(canvasElement)
      .getByRole('button', { name: /Open pickups/ })
      .click();
    await expect(args.onGo).toHaveBeenCalledWith('pickups');
  },
};
export const Finished: Story = { args: overviewFor(FINISHED).kpi };
// Nothing measured: the pickups tile and the delivery tile say so, and no figure is estimated.
export const NothingMeasured: Story = { args: overviewFor(NOTHING_RECORDED, undefined, NO_TAKE_LOG).kpi };
export const Late: Story = { args: overviewFor(MID_BOOK, new Date(2026, 9, 3)).kpi };
export const NoDueDate: Story = { args: overviewFor(MID_BOOK, null).kpi };
// A royalty-share contract draws the same six figures: no rate or amount is shown here.
export const RoyaltyShare: Story = {};
export const WithTargetInfo: Story = { args: { targetInfo: <span className="absolute top-2 right-2 text-[0.75rem]">i</span> } };
