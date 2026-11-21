import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Popover } from './Popover';
import { screen } from './portalScreen';

// Popover is an interactive popup over other content: a click opens it, focus moves in, Escape closes it and returns
// focus to the trigger, a press outside closes it too. It sits above the dialog layer (z-[70]), so it works when opened
// from inside a full-size dialog (the read-aloud dialog's microphone and Settings panels).
const meta = {
  title: 'Primitives/Popover',
  component: Popover,
  args: {
    trigger: <Button>Microphone</Button>,
    label: 'Microphone',
    children: (
      <div className="flex flex-col gap-2 text-sm">
        <p>Shure MV7</p>
        <button type="button" className="text-left text-[var(--accent)] underline">
          Refresh
        </button>
      </div>
    ),
  },
  render: (args) => (
    <div className="p-2">
      <Popover {...args} />
    </div>
  ),
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const OpensOnPress: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Microphone' });
    await userEvent.click(trigger);
    const popup = await screen.findByRole('dialog', { name: 'Microphone' });
    await expect(popup).toBeVisible();
    // Close it so the story ends with nothing open (axe runs after play).
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Microphone' })).toBeNull());
  },
};

export const ClosesOnEscapeAndReturnsFocus: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Microphone' });
    await userEvent.click(trigger);
    await screen.findByRole('dialog', { name: 'Microphone' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Microphone' })).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

// The scenario this primitive exists for: opened from inside a full-size Dialog, above its z-[60] layer, and Escape
// closes the popover first, leaving the dialog open (Dialog.tsx's escape check).
export const InsideADialog: Story = {
  render: (args) => (
    <Dialog dismissOnOutsidePress={false} title="Read aloud" onClose={() => undefined} actions={null} size="full">
      <p className="mb-4">Chapter text goes here.</p>
      <Popover {...args} />
    </Dialog>
  ),
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Read aloud' });
    const trigger = within(dialog).getByRole('button', { name: 'Microphone' });
    await userEvent.click(trigger);
    const popup = await screen.findByRole('dialog', { name: 'Microphone' });
    await expect(popup).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Microphone' })).toBeNull());
    // The dialog itself is still open: Escape closed the popover, not the dialog it sits in.
    await expect(screen.getByRole('dialog', { name: 'Read aloud' })).toBeVisible();
  },
};

// One popover for many controls (a speaker chip in the Script reader): the page keeps the rectangle of the control pressed and passes it as
// `anchor`. This one sits at the bottom edge of the window, so the popup opens above it, inside the window (#3823).
function AtAnAnchor() {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <Button className="fixed bottom-2 left-2" onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
        Hatter
      </Button>
      {anchor && (
        <Popover anchor={anchor} label="Who says this" align="start" compact fitToWindow open onOpenChange={(open) => !open && setAnchor(null)}>
          <button type="button">Alice</button>
        </Popover>
      )}
    </>
  );
}

export const OpensAtAnAnchor: Story = {
  render: () => <AtAnAnchor />,
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByRole('button', { name: 'Hatter' });
    await userEvent.click(chip);
    const popup = await screen.findByRole('dialog', { name: 'Who says this' });
    await waitFor(() => expect(popup.getBoundingClientRect().bottom).toBeLessThanOrEqual(chip.getBoundingClientRect().top));
    await expect(popup.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    await waitFor(() => expect(popup.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Who says this' })).toBeNull());
  },
};
