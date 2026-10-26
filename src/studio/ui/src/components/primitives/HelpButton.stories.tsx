import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HelpButton } from './HelpButton';

const meta = {
  title: 'Primitives/HelpButton',
  component: HelpButton,
  args: {
    label: 'About Words per page',
    children: 'The Booth marks a page break at the end of the paragraph in which a page reaches this many words. 250 is a manuscript page.',
  },
} satisfies Meta<typeof HelpButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// Closed: a 15 px "?" that takes no more room than the label beside it.
export const Closed: Story = {};

// Opened by a press: the note is a popover over the page, named by the label.
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'About Words per page' }));
    const note = await within(document.body).findByRole('dialog', { name: 'About Words per page' });
    await expect(note.textContent).toMatch(/250 is a manuscript page/);
  },
};

// The "?" scrolls out of the window with its note open (a Settings row in a short window, or a window shrunk under it): the note stays inside
// the window, clamped to its gutters and scrolling inside itself, instead of following the "?" off screen.
export const InsideTheWindow: Story = {
  render: (args) => (
    <div data-testid="scroller" className="h-[80vh] overflow-y-auto">
      <div className="h-[40vh]" />
      <HelpButton {...args} />
      <div className="h-[300vh]" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'About Words per page' }));
    const note = await within(document.body).findByRole('dialog', { name: 'About Words per page' });
    const scroller = within(canvasElement).getByTestId('scroller');
    scroller.scrollTop = scroller.scrollHeight;
    // The positioner follows the scroll on the next frames.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const box = note.getBoundingClientRect();
    await expect(box.top).toBeGreaterThanOrEqual(0);
    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth);
  },
};
