import { faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ToastRegion, type ToastMessage } from './Toast';

const meta = {
  title: 'Primitives/Toast',
  component: ToastRegion,
  args: { messages: [], dismiss: fn() },
  // The region is pinned to the bottom right of the viewport, so it needs a page to sit on.
  decorators: [(Story) => <div className="h-64 w-full">{Story()}</div>],
} satisfies Meta<typeof ToastRegion>;

export default meta;
type Story = StoryObj<typeof meta>;

const info = (id: number, text: string): ToastMessage => ({ id, text, tone: 'info' });
const failure = (id: number, text: string): ToastMessage => ({ id, text, tone: 'error' });

// An information message dismisses itself after five seconds (Storybook stops timers from mattering for the screenshot).
export const Information: Story = { args: { messages: [info(1, 'Entry saved.')] } };

// An error stays until it is dismissed, and carries an icon and a coloured edge so it is not told apart by colour alone.
export const ErrorMessage: Story = { args: { messages: [failure(1, 'The Story Bible file could not be read. It was kept next to the original.')] } };

// Messages queue up instead of replacing each other; errors sit above the information messages.
export const Queue: Story = {
  args: {
    messages: [
      failure(1, 'The comparison could not read the REAPER audio.'),
      info(2, 'Story Bible rebuild complete.'),
      info(3, 'Entry saved.'),
      info(4, 'Version 0.2.7 is available. See Settings, About & updates.'),
    ],
  },
};

// A toast can carry one action (for example Undo) before its dismiss button, and lead with the glyph of what it is about
// (the chapter-sync toast: one per batch, with Undo).
export const WithAction: Story = {
  args: { messages: [{ ...info(1, 'Linked track “Ch. 11” to Chapter 11.'), action: { label: 'Undo', onAction: fn() }, icon: faLayerGroup }] },
  play: async ({ canvasElement, args }) => {
    // The region is portalled to <body>, outside the story's canvas.
    const canvas = within(canvasElement.ownerDocument.body);
    const button = canvas.getByRole('button', { name: 'Undo' });
    await expect(button).toBeInTheDocument();
    await userEvent.click(button);
    await expect(args.messages[0].action?.onAction).toHaveBeenCalledOnce();
  },
};

// A long message wraps inside the toast instead of pushing it off a narrow window.
export const LongMessage: Story = {
  args: {
    messages: [
      failure(
        1,
        'The comparison could not read the REAPER audio for the selected track because the source file was not found at C:/Users/author/Documents/REAPER Media/Projects/Book Three/Audio Files/Chapter twenty seven take 4.wav',
      ),
    ],
  },
};

// Two live regions are always in the page: errors interrupt (alert), everything else waits (status).
export const LiveRegions: Story = {
  args: { messages: [failure(1, 'Could not save.'), info(2, 'Saved.')] },
  play: async ({ canvasElement }) => {
    // The region is portalled to <body>, outside the story's canvas.
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(within(canvas.getByRole('alert')).getByText('Could not save.')).toBeInTheDocument();
    await expect(within(canvas.getByRole('status')).getByText('Saved.')).toBeInTheDocument();
  },
};

function DismissableToasts() {
  const [messages, setMessages] = useState<ToastMessage[]>([failure(1, 'First failure.'), failure(2, 'Second failure.')]);
  return <ToastRegion messages={messages} dismiss={(id) => setMessages((current) => current.filter((message) => message.id !== id))} />;
}

// Pressing Dismiss removes that message and leaves the rest.
export const DismissRemovesOne: Story = {
  render: () => <DismissableToasts />,
  play: async ({ canvasElement }) => {
    // The region is portalled to <body>, outside the story's canvas.
    const canvas = within(canvasElement.ownerDocument.body);
    const first = canvas.getByText('First failure.').closest('[data-tone]') as HTMLElement;
    await userEvent.click(within(first).getByRole('button', { name: 'Dismiss message' }));
    await expect(canvas.queryByText('First failure.')).toBeNull();
    await expect(canvas.getByText('Second failure.')).toBeInTheDocument();
  },
};

// One word with no spaces, 10,000 letters long, on a toast that has an action (#2899): the text wraps inside a box that is never taller than the window,
// scrolls inside itself, and the action and Dismiss stay on screen and reachable. In a real browser this fails if the toast grows past the window.
export const HugeWord: Story = {
  args: { messages: [{ ...failure(1, 'x'.repeat(10_000)), action: { label: 'Retry', onAction: fn() } }] },
  play: async ({ canvasElement }) => {
    const toast = document.body.querySelector<HTMLElement>('[data-toast-region] [data-tone]');
    await expect(toast).not.toBeNull();
    const box = toast!.getBoundingClientRect();
    await expect(box.top).toBeGreaterThanOrEqual(0);
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth);
    for (const name of ['Retry', 'Dismiss message']) {
      const button = within(document.body).getByRole('button', { name }).getBoundingClientRect();
      await expect(button.top).toBeGreaterThanOrEqual(0);
      await expect(button.bottom).toBeLessThanOrEqual(window.innerHeight);
      await expect(button.right).toBeLessThanOrEqual(window.innerWidth);
    }
    // The text is all reachable: it wraps inside the box (nothing cut off sideways) and, being taller than the box allows, scrolls inside itself. A browser
    // with layout only: the unit run has none (every size is 0), where this is skipped.
    const text = toast!.querySelector<HTMLElement>('[data-toast-text]');
    await expect(text).not.toBeNull();
    if (text!.clientHeight > 0) {
      await expect(text!.scrollWidth).toBeLessThanOrEqual(text!.clientWidth + 1);
      await expect(['auto', 'scroll']).toContain(getComputedStyle(text!).overflowY);
    }
    void canvasElement;
  },
};
