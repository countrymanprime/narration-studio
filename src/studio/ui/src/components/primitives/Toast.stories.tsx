import { faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLayoutEffect, useState, type ReactNode } from 'react';
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

// An error stays for `TOAST_ERROR_MS` unless it is dismissed first, and carries an icon and a coloured edge so it is not told apart by colour alone.
export const ErrorMessage: Story = { args: { messages: [failure(1, 'The Story Bible file could not be read. It was kept next to the original.')] } };

// One long word (a Windows path) wraps inside the toast and the window instead of running off both edges (#2793).
export const LongUnbrokenMessage: Story = {
  args: { messages: [failure(1, `C:\\Users\\narrator\\Documents\\${'VeryLongProjectFolderName\\'.repeat(16)}schedule.json`)] },
};

// The same long word on an information toast and on one with an action: the button keeps its size and the words give way (#2793).
export const LongUnbrokenWithAction: Story = {
  args: {
    messages: [
      info(1, `Saved to C:\\Users\\narrator\\Documents\\${'VeryLongProjectFolderName\\'.repeat(16)}notes.json`),
      {
        id: 2,
        text: `Removed C:\\Users\\narrator\\${'VeryLongProjectFolderName\\'.repeat(16)}take.wav`,
        tone: 'info',
        action: { label: 'Undo', onAction: fn() },
      },
      {
        id: 3,
        text: `Could not read C:\\Users\\narrator\\${'VeryLongProjectFolderName\\'.repeat(16)}take.wav`,
        tone: 'error',
        action: { label: 'Retry', onAction: fn() },
      },
    ],
  },
};

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

// A word with no place to break, 10,000 letters long, wraps inside the toast, which stays inside the window (qa B3 on #2807: it once
// made the toast 121,864 px wide). The atlas measures it at its narrow viewport; jsdom lays nothing out, so the check bails there.
export const UnbreakableWord: Story = {
  args: { messages: [info(1, `Added equivalence: ${'a'.repeat(10_000)} = b`)] },
  play: async ({ canvasElement }) => {
    // The region is portalled to <body>, outside the story's canvas.
    const toast = within(canvasElement.ownerDocument.body).getByRole('status').firstElementChild;
    const box = toast?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth);
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
// A very long action label wraps inside a share of the toast (three lines at most); the message keeps room and Dismiss stays on screen.
export const LongActionLabel: Story = {
  args: {
    messages: [
      { ...failure(1, 'Failed'), action: { label: `Retry the whole export again from the very beginning ${'and again '.repeat(30)}`, onAction: fn() } },
    ],
  },
};

/** Stands in for the Booth: its footer and setup notice keep the toasts 210 px clear of the bottom, which is most of a 300 px window. */
function WithBoothBars({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--toast-clear', '210px');
    return () => {
      document.documentElement.style.removeProperty('--toast-clear');
    };
  }, []);
  return <>{children}</>;
}
export const TwoToastsAboveTheBoothBars: Story = {
  decorators: [(Story) => <WithBoothBars>{Story()}</WithBoothBars>],
  args: {
    messages: [
      { ...failure(1, 'x'.repeat(10_000)), action },
      { ...failure(2, 'Could not save the setting because the host did not answer.'), action },
    ],
  },
};

/** Every button of every toast is on screen: the story runs in the 320 x 300 window (the `tiny-window` tag), so the window is the one measured. */
async function everyButtonOnScreen(toasts: number) {
  // Let the layout settle (the bars' variable, the toasts' share of the window) before measuring.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const buttons = [...document.body.querySelectorAll<HTMLElement>('[data-toast-region] [data-tone] button')];
  await expect(buttons).toHaveLength(toasts * 2);
  // The unit run has no layout (every size is 0, the window is its own): the measuring below is for the browser, where the story runs in the 320 x 300 window.
  if (buttons[0]!.getBoundingClientRect().width === 0) return false;
  await expect([window.innerWidth, window.innerHeight]).toEqual([320, 300]);
  for (const el of buttons) {
    const b = el.getBoundingClientRect();
    const name = el.getAttribute('aria-label') ?? el.textContent?.slice(0, 20) ?? 'button';
    await expect(b.left, `${name} is left of the window`).toBeGreaterThanOrEqual(0);
    await expect(b.top, `${name} is above the window`).toBeGreaterThanOrEqual(0);
    await expect(b.bottom, `${name} is below the window`).toBeLessThanOrEqual(300);
    await expect(b.right, `${name} is right of the window`).toBeLessThanOrEqual(320);
  }
  return true;
}
export const HugeWordInTinyWindow: Story = {
  ...HugeWord,
  tags: ['tiny-window'],
  play: async () => {
    if ((await everyButtonOnScreen(1)) === false) return;
    const text = document.body.querySelector<HTMLElement>('[data-toast-text]')!;
    await expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth + 1);
  },
};
export const TwoHugeWordsInTinyWindow: Story = {
  ...TwoHugeWords,
  tags: ['tiny-window'],
  play: async () => {
    await everyButtonOnScreen(2);
  },
};
export const FiveLongMessagesInTinyWindow: Story = {
  ...FiveLongMessages,
  tags: ['tiny-window'],
  play: async () => {
    await everyButtonOnScreen(5);
  },
};
export const LongActionLabelInTinyWindow: Story = {
  ...LongActionLabel,
  tags: ['tiny-window'],
  play: async () => {
    await everyButtonOnScreen(1);
  },
};
export const TwoToastsAboveTheBoothBarsInTinyWindow: Story = {
  ...TwoToastsAboveTheBoothBars,
  tags: ['tiny-window'],
  play: async () => {
    await everyButtonOnScreen(2);
  },
};
