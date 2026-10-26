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
