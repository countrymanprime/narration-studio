import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { SpokenFigure } from './SpokenFigure';

// A figure as it is drawn ("4h 35m") with the hours and minutes spelled out for a screen reader ("4 hours 35 minutes"): the Production tiles, the stage bar's
// legend, the Est. cells and the Schedule's worked-out list (#3443). Text with no such figure is drawn as it is.
const meta = {
  title: 'Primitives/SpokenFigure',
  component: SpokenFigure,
  args: { text: '4h 35m', className: 'font-mono' },
} satisfies Meta<typeof SpokenFigure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    expect(view.getByText('4h 35m').getAttribute('aria-hidden')).toBe('true');
    expect(view.getByText('4 hours 35 minutes')).toBeTruthy();
  },
};

// A figure inside longer text, as a tile's unit "/ 3h 08m" is.
export const InsideText: Story = {
  args: { text: '/ 3h 08m' },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText('/ 3 hours 8 minutes')).toBeTruthy();
  },
};

// Under a minute, the Rec. column's "<0h 01m".
export const UnderAMinute: Story = {
  args: { text: '<0h 01m' },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText('less than a minute')).toBeTruthy();
  },
};

// Text with no figure is drawn as it is, with no hidden copy.
export const PlainText: Story = {
  args: { text: 'Not measured yet' },
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('.sr-only')).toBeNull();
  },
};
