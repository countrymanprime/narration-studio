import { faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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

// The same toast in a window of 320 x 300 (the size the issue names, which the atlas viewports are not): a frame of that size holds the story above, and the
// measuring is done on its document. A browser only: the unit run loads no frames and has no layout, so it skips this.
export const HugeWordInSmallWindow: Story = {
  render: () => (
    <iframe
      title="Toast in a 320 x 300 window"
      src="iframe.html?id=primitives-toast--huge-word&viewMode=story"
      width={320}
      height={300}
      style={{ border: 0 }}
    />
  ),
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector('iframe')!;
    if (frame.clientHeight === 0) return;
    const inner = await waitFor(
      () => {
        const doc = frame.contentDocument;
        const toast = doc?.querySelector<HTMLElement>('[data-toast-region] [data-tone]');
        if (!doc || !toast || !doc.querySelector('[data-toast-text]')) throw new Error('the toast is not up in the frame yet');
        return { doc, toast };
      },
      { timeout: 10_000 },
    );
    const view = frame.contentWindow!;
    await expect([view.innerWidth, view.innerHeight]).toEqual([320, 300]);
    const box = inner.toast.getBoundingClientRect();
    await expect(box.top).toBeGreaterThanOrEqual(0);
    await expect(box.bottom).toBeLessThanOrEqual(300);
    await expect(box.right).toBeLessThanOrEqual(320);
    const text = inner.toast.querySelector<HTMLElement>('[data-toast-text]')!;
    await expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth + 1);
    await expect(['auto', 'scroll']).toContain(view.getComputedStyle(text).overflowY);
    await expect(text.scrollHeight).toBeGreaterThan(text.clientHeight);
    for (const name of ['Retry', 'Dismiss message']) {
      const button = [...inner.doc.querySelectorAll('button')]
        .find((b) => b.getAttribute('aria-label') === name || b.textContent === name)!
        .getBoundingClientRect();
      await expect(button.top).toBeGreaterThanOrEqual(0);
      await expect(button.bottom).toBeLessThanOrEqual(300);
      await expect(button.right).toBeLessThanOrEqual(320);
    }
  },
};

const action = { label: 'Retry', onAction: fn() };
// Several toasts at once share the window: each one's text is capped to its share, so no toast's Retry or Dismiss ends up above the window (#2899).
export const TwoHugeWords: Story = {
  args: {
    messages: [
      { ...failure(1, 'x'.repeat(10_000)), action },
      { ...failure(2, 'y'.repeat(10_000)), action },
    ],
  },
};
export const FiveLongMessages: Story = {
  args: {
    messages: [1, 2, 3, 4, 5].map((id) => ({
      ...failure(id, `${id}: Could not save the setting because the host did not answer, and the reason is long enough to wrap.`),
      action,
    })),
  },
};

/** A frame of 320 x 300 holding a story of this file; waits for its toasts and returns every button they carry, with the frame's size. */
async function toastsInSmallWindow(canvasElement: HTMLElement, count: number) {
  const frame = canvasElement.querySelector('iframe')!;
  if (frame.clientHeight === 0) return null;
  const doc = await waitFor(
    () => {
      const d = frame.contentDocument;
      if (!d || d.querySelectorAll('[data-toast-region] [data-tone]').length < count) throw new Error('the toasts are not up in the frame yet');
      return d;
    },
    { timeout: 10_000 },
  );
  const view = frame.contentWindow!;
  const buttons = [...doc.querySelectorAll<HTMLElement>('[data-toast-region] [data-tone] button')].map((b) => ({
    name: b.getAttribute('aria-label') ?? b.textContent ?? '',
    ...b.getBoundingClientRect().toJSON(),
  }));
  return { width: view.innerWidth, height: view.innerHeight, buttons };
}
const framed = (id: string) => (
  <iframe title="Toasts in a 320 x 300 window" src={`iframe.html?id=${id}&viewMode=story`} width={320} height={300} style={{ border: 0 }} />
);
async function expectEveryButtonOnScreen(canvasElement: HTMLElement, toasts: number) {
  const seen = await toastsInSmallWindow(canvasElement, toasts);
  if (!seen) return;
  await expect([seen.width, seen.height]).toEqual([320, 300]);
  await expect(seen.buttons.length).toBe(toasts * 2);
  for (const b of seen.buttons) {
    await expect(b.top, `${b.name} is above the window`).toBeGreaterThanOrEqual(0);
    await expect(b.bottom, `${b.name} is below the window`).toBeLessThanOrEqual(300);
    await expect(b.right).toBeLessThanOrEqual(320);
  }
}
export const TwoHugeWordsInSmallWindow: Story = {
  render: () => framed('primitives-toast--two-huge-words'),
  play: async ({ canvasElement }) => expectEveryButtonOnScreen(canvasElement, 2),
};
export const FiveLongMessagesInSmallWindow: Story = {
  render: () => framed('primitives-toast--five-long-messages'),
  play: async ({ canvasElement }) => expectEveryButtonOnScreen(canvasElement, 5),
};
