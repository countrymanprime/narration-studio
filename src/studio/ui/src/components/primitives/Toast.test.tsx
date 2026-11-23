// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';
import { tabInsideTrap } from './tabInsideTrap';
import {
  ACTION_FOCUS_MS,
  retryAction,
  TOAST_ACTION_MS,
  TOAST_HEIGHT_PROPERTY,
  useToastsClearOfModal,
  TOAST_ERROR_MS,
  TOAST_INFO_MS,
  TOAST_MAX_MS,
  ToastRegion,
  toastLifetimeMs,
  type ToastMessage,
} from './Toast';

beforeEach(() => vi.useFakeTimers());
/** The pointer moves over a toast: a move on it, which is what holds it (the browser's enter, sent when a toast appears under a resting pointer, does not). */
function hoverOn(toast: Element): void {
  fireEvent.pointerMove(toast, { clientX: 5, clientY: 5 });
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const info = (id: number, text = `Message ${id}`): ToastMessage => ({ id, text, tone: 'info' });
const failure = (id: number, text = `Failure ${id}`): ToastMessage => ({ id, text, tone: 'error' });

describe('ToastRegion', () => {
  it('is drawn in <body>, outside the isolated #root, so it stacks above a dialog or slide-over raised from the page', () => {
    const { container } = render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
    const region = screen.getByText('Message 1').closest('[data-toast-region]') as HTMLElement;
    expect(region.parentElement).toBe(document.body);
    expect(container.contains(region)).toBe(false);
    expect(region.className).toContain('z-[var(--z-toast)]');
  });

  // #3416 item 39 (qa-breaker): a press on a toast's plain text over a dialog that ignores outside presses moved focus from the dialog's control to <body>.
  it('does not take focus from a modal when its plain text is pressed, and leaves its own buttons alone', () => {
    document.documentElement.setAttribute('data-modal-open', '');
    try {
      render(
        <ToastRegion messages={[{ id: 1, text: 'REAPER stopped recording', tone: 'info', action: { label: 'Undo', onAction: vi.fn() } }]} dismiss={vi.fn()} />,
      );
      const text = createEvent.mouseDown(screen.getByText('REAPER stopped recording'), { cancelable: true, bubbles: true });
      fireEvent(screen.getByText('REAPER stopped recording'), text);
      expect(text.defaultPrevented).toBe(true);
      const button = createEvent.mouseDown(screen.getByRole('button', { name: 'Dismiss message' }), { cancelable: true, bubbles: true });
      fireEvent(screen.getByRole('button', { name: 'Dismiss message' }), button);
      expect(button.defaultPrevented).toBe(false);
    } finally {
      document.documentElement.removeAttribute('data-modal-open');
    }
  });

  it('leaves a press on its text alone when no modal is open', () => {
    render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
    const press = createEvent.mouseDown(screen.getByText('Message 1'), { cancelable: true, bubbles: true });
    fireEvent(screen.getByText('Message 1'), press);
    expect(press.defaultPrevented).toBe(false);
  });

  it('keeps two live regions mounted, so a message that arrives later is announced', () => {
    render(<ToastRegion messages={[]} dismiss={vi.fn()} />);
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
    // A new message is read on its own; without this, each one re-reads every message already showing.
    for (const region of [screen.getByRole('status'), screen.getByRole('alert')]) {
      expect(region.getAttribute('aria-atomic')).toBe('false');
      expect(region.getAttribute('aria-relevant')).toBe('additions');
    }
  });

  it('puts an error in the alert region and everything else in the status region', () => {
    const { rerender } = render(<ToastRegion messages={[failure(2, 'Could not save.')]} dismiss={vi.fn()} />);
    expect(within(screen.getByRole('alert')).getByText('Could not save.')).toBeTruthy();
    expect(within(screen.getByRole('status')).queryByText('Could not save.')).toBeNull();
    rerender(<ToastRegion messages={[info(1, 'Saved.')]} dismiss={vi.fn()} />);
    expect(within(screen.getByRole('status')).getByText('Saved.')).toBeTruthy();
    expect(within(screen.getByRole('alert')).queryByText('Saved.')).toBeNull();
  });

  it('dismisses an information message by itself after its time, and fades it first', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[info(7)]} dismiss={dismiss} />);
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS - 200));
    expect(dismiss).not.toHaveBeenCalled();
    expect(screen.getByText('Message 7').closest('[data-tone]')?.className).not.toContain('opacity-0');
    act(() => void vi.advanceTimersByTime(100));
    expect(screen.getByText('Message 7').closest('[data-tone]')?.className).toContain('opacity-0');
    act(() => void vi.advanceTimersByTime(100));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('stays as long as its own duration when it has one', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[{ ...info(8), durationMs: 10_000 }]} dismiss={dismiss} />);
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS + 1000));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(10_000 - TOAST_INFO_MS - 1000));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(8);
  });

  it('keeps a toast whose button is the only route for TOAST_ACTION_MS (12 s), longer than every other action toast', () => {
    expect(TOAST_ACTION_MS).toBe(12_000);
    const dismiss = vi.fn();
    render(<ToastRegion messages={[{ ...info(9), action: { label: 'Show them', onAction: vi.fn() }, durationMs: TOAST_ACTION_MS }]} dismiss={dismiss} />);
    act(() => void vi.advanceTimersByTime(TOAST_ACTION_MS - 1000));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1000));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(9);
  });

  it('keeps an error longer than an information message, and dismisses it at its own limit (#3431)', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[failure(3)]} dismiss={dismiss} />);
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS * 2));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS - TOAST_INFO_MS * 2 - 1));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('holds an error while the pointer is on it or focus is in it, and gives it the full time again after', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[failure(4)]} dismiss={dismiss} />);
    const toast = screen.getByText('Failure 4').closest('[data-tone]') as HTMLElement;
    hoverOn(toast);
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS * 3));
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(toast);
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS - 1));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(4);
  });

  // A toast under a pointer that rests on the control that raised it, or that shifts under it in a stack, is not held: the browser says the pointer entered, the narrator did not reach for it (#4063).
  it('does not hold an error the browser says the pointer entered, and holds it once the pointer moves on it', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[failure(7)]} dismiss={dismiss} />);
    const toast = screen.getByText('Failure 7').closest('[data-tone]') as HTMLElement;
    fireEvent.pointerEnter(toast, { clientX: 40, clientY: 50 });
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(7);
    dismiss.mockClear();
    render(<ToastRegion messages={[failure(8)]} dismiss={dismiss} />);
    const second = screen.getByText('Failure 8').closest('[data-tone]') as HTMLElement;
    fireEvent.pointerEnter(second, { clientX: 44, clientY: 50 });
    hoverOn(second);
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS * 2));
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('draws Retry at least 24 px each way (target size)', () => {
    render(<ToastRegion messages={[{ ...failure(9), action: retryAction(vi.fn()) }]} dismiss={vi.fn()} />);
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry.className).toContain('min-h-6');
    expect(retry.className).toContain('min-w-6');
  });

  // A press of the mouse on a stack's Dismiss or Retry must not put focus on the next toast: focus there holds it (the timer waits on focus) with no ring, and it never expires (#4063, qa-breaker B1).
  it.each(['Dismiss message', 'Retry'])("a mouse press on %s with another toast waiting leaves the next toast's timer running", (name) => {
    const dismiss = vi.fn();
    const action = { label: 'Retry', onAction: vi.fn() };
    const older = { ...failure(1, 'Older'), action };
    const newer = { ...failure(2, 'Newer'), action };
    const { rerender } = render(<ToastRegion messages={[older, newer]} dismiss={dismiss} />);
    const button = within(screen.getByText('Older').closest('[data-tone]') as HTMLElement).getByRole('button', { name });
    button.focus();
    fireEvent.click(button, { detail: 1 });
    act(() => void vi.advanceTimersByTime(500));
    expect(dismiss).toHaveBeenCalledWith(1);
    // The next toast takes the slot with no focus on it, so nothing holds its clock.
    rerender(<ToastRegion messages={[newer]} dismiss={dismiss} />);
    expect(screen.getByText('Newer').closest('[data-tone]')!.contains(document.activeElement)).toBe(false);
    dismiss.mockClear();
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS));
    expect(dismiss).toHaveBeenCalledWith(2);
  });

  it('dismisses the message whose button was pressed', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[failure(1), failure(2)]} dismiss={dismiss} />);
    fireEvent.click(within(screen.getByText('Failure 1').closest('[data-tone]') as HTMLElement).getByRole('button', { name: 'Dismiss message' }));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('shows an action button before the dismiss button, and pressing it runs the action and dismisses the toast', () => {
    const dismiss = vi.fn();
    const onAction = vi.fn();
    render(<ToastRegion messages={[{ ...info(1, 'Linked track “Ch. 11” to Chapter 11.'), action: { label: 'Undo', onAction } }]} dismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('shows no action button when a message has none', () => {
    render(<ToastRegion messages={[info(1, 'Saved.')]} dismiss={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('starts a message over when it is replaced by one with a new id, and shows one at a time with a count of the rest', () => {
    const dismiss = vi.fn();
    const { rerender } = render(<ToastRegion messages={[info(1, 'Same'), info(2, 'Other')]} dismiss={dismiss} />);
    expect(screen.getAllByRole('button', { name: 'Dismiss message' })).toHaveLength(1);
    expect(screen.getByText('+1')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS - 500));
    rerender(<ToastRegion messages={[info(2, 'Other'), info(3, 'Same')]} dismiss={dismiss} />);
    act(() => void vi.advanceTimersByTime(600));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('leads an information message with its icon, and an error with its warning glyph only', () => {
    const { rerender } = render(<ToastRegion messages={[{ ...info(1, 'Linked.'), icon: faLayerGroup }]} dismiss={vi.fn()} />);
    expect(within(screen.getByRole('status')).getByText('Linked.').parentElement!.querySelector('svg[data-icon="layer-group"]')).not.toBeNull();
    rerender(<ToastRegion messages={[{ ...failure(2), icon: faLayerGroup }]} dismiss={vi.fn()} />);
    const error = within(screen.getByRole('alert')).getByText('Failure 2').parentElement!;
    expect(error.querySelector('svg[data-icon="circle-exclamation"]')).not.toBeNull();
    expect(error.querySelector('svg[data-icon="layer-group"]')).toBeNull();
  });

  // Alignment audit cause P: a toast at the bottom right covered an open dialog's Cancel and Download buttons. The behaviour changed: it moved to the
  // top of the window, where it covered the top bar's buttons (R4BO2-4); now the dialog hangs from the top and stops 4.75rem short of the bottom, and
  // the toast keeps to the bottom-right corner at the gutter, ignoring the bottom bars behind the scrim.
  it('keeps to the bottom-right corner at the gutter while a dialog is open', () => {
    render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
    const region = screen.getByText('Message 1').closest('[data-toast-region]') as HTMLElement;
    expect(region.className).toContain('[:root[data-modal-open]_&]:right-[var(--page-gutter)]');
    expect(region.className).not.toContain('top-4');
    // The region always stands at the gutter: the shell ends the page above it (`--toast-h`), so it rises over no bar and is raised by none (#4063).
    expect(region.className).toContain('bottom-[var(--toast-bottom,var(--page-gutter))]');
    // In a window 520 px tall or shorter there is no slot: the toasts rise above the bars (`--toast-clear`) (#3322), and over a dialog keep to the gutter.
    expect(region.className).toContain('[@media(max-height:520px)]:bottom-[calc(var(--page-gutter)+min(var(--toast-clear,0px)');
    expect(region.className).toContain('[:root[data-modal-open]_&]:bottom-[var(--page-gutter)]');
    expect(region.className).not.toContain('--toast-reserve');
    expect(document.documentElement.hasAttribute('data-modal-open')).toBe(false);
    const first = render(
      <Dialog dismissOnOutsidePress={false} title="Download model" actions={null}>
        <p>Body</p>
      </Dialog>,
    );
    const second = render(
      <Dialog dismissOnOutsidePress={false} title="Are you sure?" actions={null}>
        <p>Body</p>
      </Dialog>,
    );
    expect(document.documentElement.hasAttribute('data-modal-open')).toBe(true);
    second.unmount();
    expect(document.documentElement.hasAttribute('data-modal-open')).toBe(true);
    first.unmount();
    expect(document.documentElement.hasAttribute('data-modal-open')).toBe(false);
  });

  // XBO-13, R3SE2-4, R3PF-4: the dismiss X was a bare 17 x 20 glyph, and the error edge a border bent round the radius.
  it("draws the dismiss button as a 32 px square, and an error's edge as a strip inside the clipped box", () => {
    render(<ToastRegion messages={[failure(1)]} dismiss={vi.fn()} />);
    const toast = screen.getByText('Failure 1').closest('[data-tone]') as HTMLElement;
    expect(within(toast).getByRole('button', { name: 'Dismiss message' }).className).toContain('size-[var(--button-height-sm)]');
    expect(toast.className).not.toContain('border-l-4');
    expect(toast.className).toContain('overflow-hidden');
    expect(toast.querySelector('[data-toast-edge]')!.className).toContain('bg-[var(--danger)]');
  });
});

describe('a toast is two lines at most (#4063, #2793)', () => {
  const HUGE = 'x'.repeat(10_000);
  const textOf = (id: string) => screen.getByText(id, { exact: false }).closest('[data-toast-text]') as HTMLElement;

  it.each([
    ['one 10,000-letter word', HUGE],
    ['emoji and right-to-left text', 'שלום \u{1F3A4} '.repeat(2_000)],
  ])('wraps %s anywhere inside a toast of a fixed height, and leaves the buttons their room', (_name, text) => {
    render(<ToastRegion messages={[{ ...failure(1, text), action: { label: 'Retry', onAction: vi.fn() } }]} dismiss={vi.fn()} />);
    const el = document.querySelector('[data-toast-text]') as HTMLElement;
    expect(el.className).toContain('[overflow-wrap:anywhere]');
    expect(el.className).toContain('max-h-[2.5em]');
    expect(el.textContent).toBe(text);
    expect(el.closest('[data-tone]')!.className).toContain('h-[3.5rem]');
    // The action and Dismiss are siblings of the scrolling text, so they never scroll away with it.
    expect(el.contains(screen.getByRole('button', { name: 'Retry' }))).toBe(false);
    expect(within(el.parentElement!).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(within(el.parentElement!).getByRole('button', { name: 'Dismiss message' })).toBeTruthy();
  });

  it('puts the text in the tab order only while it overflows, so a short message adds no Tab stop', () => {
    const observers: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    const sizes = { scrollHeight: 10, clientHeight: 10 };
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => sizes.scrollHeight);
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => sizes.clientHeight);
    render(<ToastRegion messages={[info(1, HUGE)]} dismiss={vi.fn()} />);
    expect(textOf('xxxx').getAttribute('tabindex')).toBeNull();
    // Plain text, not a scroller (a scroller is a tab stop in Chromium even when it overflows by a sub-pixel), but it keeps the keys that scroll it either way.
    expect(textOf('xxxx').className).toContain('overflow-hidden');
    expect(textOf('xxxx').className).not.toContain('overflow-y-auto');
    sizes.scrollHeight = 500;
    act(() => observers.forEach((cb) => cb()));
    expect(textOf('xxxx').getAttribute('tabindex')).toBe('0');
    // While it scrolls it keeps the keys that scroll it: a page shortcut (Space starts a recording in the Booth) never fires from it (src/input/targets.ts).
    expect(textOf('xxxx').hasAttribute('data-owns-keys')).toBe(true);
    expect(textOf('xxxx').className).toContain('overflow-y-auto');
    scrollHeight.mockRestore();
    clientHeight.mockRestore();
    vi.unstubAllGlobals();
  });

  it('leaves an ordinary short message out of the tab order', () => {
    render(<ToastRegion messages={[info(1, 'Entry saved.')]} dismiss={vi.fn()} />);
    expect(textOf('Entry saved.').getAttribute('tabindex')).toBeNull();
  });
});

describe('the slot the shell keeps for one toast (#4063)', () => {
  const slot = () => document.documentElement.style.getPropertyValue('--toast-slot');
  afterEach(() => cleanup());

  it('is set while the region is mounted, even with no toast, in px, and goes with the region', () => {
    const { unmount } = render(<ToastRegion messages={[]} dismiss={vi.fn()} />);
    expect(slot()).toMatch(/^\d+px$/);
    expect(document.documentElement.style.getPropertyValue('--toast-bottom')).toMatch(/^\d+px$/);
    unmount();
    expect(slot()).toBe('');
  });

  it('is one toast high plus the gap under it and the air above it, so showing one toast moves nothing', () => {
    render(<ToastRegion messages={[]} dismiss={vi.fn()} />);
    const bottom = Number.parseFloat(document.documentElement.style.getPropertyValue('--toast-bottom'));
    // 56 px of toast (two lines) and 8 px of air at a 16 px root font: 16 + 56 + 8 = 80 px.
    expect(Number.parseFloat(slot())).toBe(Math.ceil(bottom + 56 + 8));
  });
});

describe('ToastRegion, action labels and focus (issue 2899)', () => {
  it('cuts a long action label to one line at a share of the toast, so Dismiss and the message keep their room', () => {
    render(
      <ToastRegion
        messages={[{ ...failure(1, 'Failed'), action: { label: `Retry ${'the whole export again '.repeat(10)}`, onAction: vi.fn() } }]}
        dismiss={vi.fn()}
      />,
    );
    const action = screen.getByRole('button', { name: /^Retry the whole/ });
    expect(action.className).toContain('max-w-[40%]');
    expect(action.className).toContain('flex-none');
    expect(action.className).toContain('truncate');
    // The whole label is the button's title.
    expect(action.getAttribute('title')).toMatch(/^Retry the whole export again/);
    expect(screen.getByRole('button', { name: 'Dismiss message' }).className).toContain('flex-none');
  });

  it('hands focus back to where it was when the focused toast is dismissed with the keyboard, and leaves it alone when a pointer dismissed a toast that had no focus', () => {
    const dismiss = vi.fn();
    render(
      <>
        <button>Origin</button>
        <ToastRegion messages={[failure(1)]} dismiss={dismiss} />
      </>,
    );
    const origin = screen.getByRole('button', { name: 'Origin' });
    const dismissButton = screen.getByRole('button', { name: 'Dismiss message' });
    origin.focus();
    act(() => dismissButton.focus());
    fireEvent.click(dismissButton);
    act(() => void vi.advanceTimersByTime(1));
    expect(dismiss).toHaveBeenLastCalledWith(1);
    expect(document.activeElement).toBe(origin);
    // A click that did not have focus moves nothing.
    (document.activeElement as HTMLElement).blur();
    fireEvent.click(dismissButton);
    act(() => void vi.advanceTimersByTime(1));
    expect(document.activeElement).toBe(document.body);
  });
});

describe('ToastRegion under a hand or a key (issue 2956)', () => {
  it('holds the timer while the pointer is on the toast and starts the full time again when it leaves', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[info(1)]} dismiss={dismiss} />);
    const toast = screen.getByText('Message 1').closest('[data-tone]')!;
    hoverOn(toast);
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS * 3));
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(toast);
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS - 1));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('holds the timer while focus is inside the toast, and not after it leaves', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[{ ...info(1), action: { label: 'Undo', onAction: vi.fn() } }]} dismiss={dismiss} />);
    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS * 3));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => screen.getByRole('button', { name: 'Undo' }).blur());
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('hands focus back to the control that had it before the toast, after Dismiss or the action', () => {
    const onAction = vi.fn();
    const opener = document.createElement('button');
    document.body.append(opener);
    for (const press of ['Dismiss message', 'Undo']) {
      const messages = [{ ...info(1), action: { label: 'Undo', onAction } }];
      const view = render(<ToastRegion messages={messages} dismiss={vi.fn()} />);
      opener.focus();
      const button = screen.getByRole('button', { name: press });
      fireEvent.focus(button, { relatedTarget: opener });
      button.focus();
      fireEvent.click(button);
      // The service takes the toast away, and focus with it.
      view.rerender(<ToastRegion messages={[]} dismiss={vi.fn()} />);
      act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS));
      expect(document.activeElement).toBe(opener);
      cleanup();
    }
    opener.remove();
  });

  // What a press or a focused toast leaves behind belongs to the region (#4103): after it unmounts, a later page's toast is never handed focus, and no listener of the old region is left.
  const withUndo = (id: number): ToastMessage => ({ ...info(id), action: { label: 'Undo', onAction: vi.fn() } });
  const nextPageToast = () => {
    render(<ToastRegion messages={[info(99)]} dismiss={vi.fn()} />);
  };

  it('does not move focus after its region is gone: a press leaves no hand-back timer for the next page to meet', () => {
    const view = render(<ToastRegion messages={[withUndo(1)]} dismiss={vi.fn()} />);
    const undo = screen.getByRole('button', { name: 'Undo' });
    undo.focus();
    // A key press (`detail` 0) on the focused action waits ACTION_FOCUS_MS before handing focus back.
    fireEvent.click(undo);
    view.unmount();
    // The next page raises a toast of its own, with focus on nothing: the old press must not hand focus to it.
    nextPageToast();
    expect(document.activeElement).toBe(document.body);
    act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS * 2));
    expect(document.activeElement).toBe(document.body);
  });

  it('a toast removed with focus inside it hands focus nowhere once its region is gone (the unmount fallback belongs to the region)', () => {
    const view = render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
    act(() => screen.getByRole('button', { name: 'Dismiss message' }).focus());
    view.unmount();
    nextPageToast();
    act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS * 2));
    expect(document.activeElement).toBe(document.body);
  });

  it("a toast replaced in its own region still hands focus on (the fallback is the region's, not cancelled by it)", () => {
    const view = render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
    act(() => screen.getByRole('button', { name: 'Dismiss message' }).focus());
    view.rerender(<ToastRegion messages={[info(2)]} dismiss={vi.fn()} />);
    act(() => void vi.advanceTimersByTime(10));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss message' }));
  });

  it("removes the listeners that swallow a held key's repeats when the region goes: a repeat on an unrelated field is its own", () => {
    const field = document.createElement('input');
    document.body.append(field);
    const view = render(<ToastRegion messages={[withUndo(1)]} dismiss={vi.fn()} />);
    const undo = screen.getByRole('button', { name: 'Undo' });
    undo.focus();
    fireEvent.keyDown(undo, { key: 'Enter', code: 'Enter' });
    view.unmount();
    // The key comes up after the region has gone, on the page: the listeners were removed with the region, so a later repeat of any key on a field is the field's.
    const repeat = createEvent.keyDown(field, { key: 'a', code: 'KeyA', repeat: true });
    fireEvent(field, repeat);
    expect(repeat.defaultPrevented).toBe(false);
    field.remove();
  });

  it('cancels the hand-back of a key that is still held when the region goes: its keyup then schedules nothing', () => {
    const view = render(<ToastRegion messages={[withUndo(1)]} dismiss={vi.fn()} />);
    const undo = screen.getByRole('button', { name: 'Undo' });
    undo.focus();
    fireEvent.keyDown(undo, { key: 'Enter', code: 'Enter' });
    fireEvent.click(undo, { detail: 0 });
    view.unmount();
    nextPageToast();
    fireEvent.keyUp(document.body, { key: 'Enter', code: 'Enter' });
    act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS * 2));
    expect(document.activeElement).toBe(document.body);
  });

  it('cancels a hand-back already waiting out ACTION_FOCUS_MS when the region goes after the held key came up', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const view = render(<ToastRegion messages={[withUndo(1)]} dismiss={vi.fn()} />);
    opener.focus();
    const undo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.focus(undo, { relatedTarget: opener });
    undo.focus();
    fireEvent.keyDown(undo, { key: 'Enter', code: 'Enter' });
    fireEvent.click(undo, { detail: 0 });
    // The key comes up: the hand-back is now a timer of ACTION_FOCUS_MS. The region goes before it runs.
    fireEvent.keyUp(undo, { key: 'Enter', code: 'Enter' });
    view.unmount();
    act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS * 2));
    expect(document.activeElement).not.toBe(opener);
    opener.remove();
  });

  it("a second press replaces the first one's pending hand-back: the second one wins", () => {
    const first = document.createElement('button');
    const second = document.createElement('button');
    document.body.append(first, second);
    const view = render(<ToastRegion messages={[withUndo(1)]} dismiss={vi.fn()} />);
    first.focus();
    const undoOne = screen.getByRole('button', { name: 'Undo' });
    fireEvent.focus(undoOne, { relatedTarget: first });
    undoOne.focus();
    fireEvent.click(undoOne, { detail: 0 });
    view.rerender(<ToastRegion messages={[withUndo(2)]} dismiss={vi.fn()} />);
    second.focus();
    const undoTwo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.focus(undoTwo, { relatedTarget: second });
    undoTwo.focus();
    fireEvent.click(undoTwo, { detail: 0 });
    view.rerender(<ToastRegion messages={[]} dismiss={vi.fn()} />);
    act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS * 2));
    expect(document.activeElement).toBe(second);
    first.remove();
    second.remove();
  });

  it("keeps one region's hand-back when another region goes (the owner is the region's, not the module's)", () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const kept = render(<ToastRegion messages={[withUndo(1)]} dismiss={vi.fn()} />);
    const other = render(<ToastRegion messages={[info(2, 'Other')]} dismiss={vi.fn()} />);
    opener.focus();
    const undo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.focus(undo, { relatedTarget: opener });
    undo.focus();
    fireEvent.click(undo, { detail: 0 });
    kept.rerender(<ToastRegion messages={[]} dismiss={vi.fn()} />);
    other.unmount();
    act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS * 2));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("in React's development remount (StrictMode) a press still hands focus back: closing and reopening the owner cancels nothing", () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const view = render(
      <StrictMode>
        <ToastRegion messages={[withUndo(1)]} dismiss={vi.fn()} />
      </StrictMode>,
    );
    opener.focus();
    const undo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.focus(undo, { relatedTarget: opener });
    undo.focus();
    fireEvent.click(undo, { detail: 0 });
    // The service takes the toast away, and focus with it.
    view.rerender(
      <StrictMode>
        <ToastRegion messages={[]} dismiss={vi.fn()} />
      </StrictMode>,
    );
    act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS * 2));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  describe('focus the press did not move is handed back; focus something else took is left (#4103)', () => {
    /** A dialog with a field in it, opened by whatever the press did (the Jump menu): the field takes focus. */
    const openFieldInDialog = () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      const input = document.createElement('input');
      dialog.append(input);
      document.body.append(dialog);
      input.focus();
      return { input, dialog };
    };
    const pressers: { name: string; messages: () => ToastMessage[]; button: string }[] = [
      { name: 'Dismiss', messages: () => [info(1)], button: 'Dismiss message' },
      { name: 'Retry', messages: () => [{ ...failure(1), action: { label: 'Retry', onAction: vi.fn() } }], button: 'Retry' },
      { name: 'Undo', messages: () => [withUndo(1)], button: 'Undo' },
    ];
    for (const presser of pressers) {
      it(`a held ${presser.name} hands focus back only to nothing: a dialog opened before the key comes up keeps focus`, () => {
        const origin = document.createElement('button');
        document.body.append(origin);
        render(<ToastRegion messages={presser.messages()} dismiss={vi.fn()} />);
        origin.focus();
        const button = screen.getByRole('button', { name: presser.button });
        fireEvent.focus(button, { relatedTarget: origin });
        button.focus();
        fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
        fireEvent.click(button, { detail: 0 });
        // While the key is still down, a dialog opens and its field takes focus (the Jump menu).
        const { input, dialog } = openFieldInDialog();
        fireEvent.keyUp(input, { key: 'Enter', code: 'Enter' });
        act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS * 2));
        expect(document.activeElement).toBe(input);
        dialog.remove();
        origin.remove();
      });

      it(`a held ${presser.name}: another key's coming up (Ctrl+K opening a dialog) does not end the wait or move focus`, () => {
        const origin = document.createElement('button');
        document.body.append(origin);
        render(<ToastRegion messages={presser.messages()} dismiss={vi.fn()} />);
        origin.focus();
        const button = screen.getByRole('button', { name: presser.button });
        fireEvent.focus(button, { relatedTarget: origin });
        button.focus();
        fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
        fireEvent.click(button, { detail: 0 });
        const { input, dialog } = openFieldInDialog();
        // K comes up while Enter is still held: not the held key, so the hand-back still waits.
        fireEvent.keyUp(input, { key: 'k', code: 'KeyK' });
        act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS * 2));
        expect(document.activeElement).toBe(input);
        fireEvent.keyUp(input, { key: 'Enter', code: 'Enter' });
        act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS * 2));
        expect(document.activeElement).toBe(input);
        dialog.remove();
        origin.remove();
      });
    }

    it('still hands focus back to the origin when nothing else took it, for a held Dismiss', () => {
      const origin = document.createElement('button');
      document.body.append(origin);
      const view = render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
      origin.focus();
      const dismiss = screen.getByRole('button', { name: 'Dismiss message' });
      fireEvent.focus(dismiss, { relatedTarget: origin });
      dismiss.focus();
      fireEvent.keyDown(dismiss, { key: 'Enter', code: 'Enter' });
      fireEvent.click(dismiss, { detail: 0 });
      view.rerender(<ToastRegion messages={[]} dismiss={vi.fn()} />);
      fireEvent.keyUp(document.body, { key: 'Enter', code: 'Enter' });
      act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS));
      expect(document.activeElement).toBe(origin);
      origin.remove();
    });
  });

  it('leaves focus where the action put it', () => {
    const elsewhere = document.createElement('input');
    document.body.append(elsewhere);
    render(<ToastRegion messages={[{ ...info(1), action: { label: 'Open', onAction: () => elsewhere.focus() } }]} dismiss={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Open' });
    button.focus();
    fireEvent.click(button);
    act(() => void vi.advanceTimersByTime(ACTION_FOCUS_MS));
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});

describe('ToastRegion time left (#3667)', () => {
  const bar = (text: string) => screen.getByText(text).closest('[data-tone]')!.querySelector<HTMLElement>('[data-toast-countdown]')!;
  const runs = (el: HTMLElement) => el.className.includes('motion-ok:animate-[toast-countdown_linear_forwards]');

  it("draws a bar that lasts as long as the toast does: its tone's time, an action's, and its own durationMs", () => {
    const { rerender } = render(<ToastRegion messages={[]} dismiss={vi.fn()} />);
    for (const [message, text, ms] of [
      [info(1), 'Message 1', TOAST_INFO_MS],
      [failure(2), 'Failure 2', TOAST_ERROR_MS],
      [{ ...info(3), action: { label: 'Show them', onAction: vi.fn() }, durationMs: TOAST_ACTION_MS }, 'Message 3', TOAST_ACTION_MS],
      [{ ...info(4), durationMs: 10_000 }, 'Message 4', 10_000],
    ] as const) {
      rerender(<ToastRegion messages={[message]} dismiss={vi.fn()} />);
      expect(bar(text).style.animationDuration, text).toBe(`${ms}ms`);
      expect(runs(bar(text)), text).toBe(true);
    }
  });

  it('is not read out, takes no press, and is hidden under reduced motion (the stepped bar takes its place)', () => {
    render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
    const el = bar('Message 1');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toContain('pointer-events-none');
    expect(el.className).toContain('motion-still:hidden');
    expect(el.textContent).toBe('');
  });

  it('shows the bar whole and still while the pointer or focus holds the toast, and runs it from the full width again on leaving', () => {
    render(<ToastRegion messages={[{ ...info(1), action: { label: 'Undo', onAction: vi.fn() } }]} dismiss={vi.fn()} />);
    const toast = screen.getByText('Message 1').closest('[data-tone]')!;
    expect(runs(bar('Message 1'))).toBe(true);
    hoverOn(toast);
    expect(runs(bar('Message 1'))).toBe(false);
    expect(bar('Message 1').style.animationDuration).toBe('');
    fireEvent.pointerLeave(toast);
    expect(runs(bar('Message 1'))).toBe(true);
    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    expect(runs(bar('Message 1'))).toBe(false);
    act(() => screen.getByRole('button', { name: 'Undo' }).blur());
    expect(runs(bar('Message 1'))).toBe(true);
  });

  describe('under reduced motion the stepped bar (#3667)', () => {
    const stepped = (text: string) => screen.getByText(text).closest('[data-tone]')!.querySelector<HTMLElement>('[data-toast-countdown-stepped]')!;
    const scale = (el: HTMLElement) => Number(/scaleX\(([\d.]+)\)/.exec(el.style.transform)?.[1]);

    it('is drawn only under reduced motion, takes no press and is not read out', () => {
      render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
      const el = stepped('Message 1');
      expect(el.className).toMatch(/(^| )hidden /);
      expect(el.className).toContain('motion-still:block');
      expect(el.className).toContain('pointer-events-none');
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.textContent).toBe('');
    });

    it("steps once a second over the toast's own time, with no animation, and is empty when the toast goes", () => {
      const { rerender } = render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
      expect(scale(stepped('Message 1'))).toBe(1);
      act(() => void vi.advanceTimersByTime(999));
      expect(scale(stepped('Message 1')), 'not before a whole second').toBe(1);
      act(() => void vi.advanceTimersByTime(1));
      expect(scale(stepped('Message 1'))).toBeCloseTo(1 - 1000 / TOAST_INFO_MS);
      act(() => void vi.advanceTimersByTime(1500));
      expect(scale(stepped('Message 1')), 'the whole second it has reached').toBeCloseTo(1 - 2000 / TOAST_INFO_MS);
      expect(stepped('Message 1').className).not.toContain('animate-');
      expect(stepped('Message 1').style.animationDuration).toBe('');
      rerender(<ToastRegion messages={[failure(2)]} dismiss={vi.fn()} />);
      act(() => void vi.advanceTimersByTime(2000));
      expect(scale(stepped('Failure 2')), 'an error lasts longer, so its bar is longer').toBeCloseTo(1 - 2000 / TOAST_ERROR_MS);
    });

    it('holds whole and still while the pointer or focus holds the toast, and starts again from full on leaving', () => {
      render(<ToastRegion messages={[{ ...info(1), action: { label: 'Undo', onAction: vi.fn() } }]} dismiss={vi.fn()} />);
      const toast = screen.getByText('Message 1').closest('[data-tone]')!;
      act(() => void vi.advanceTimersByTime(3000));
      expect(scale(stepped('Message 1'))).toBeCloseTo(1 - 3000 / TOAST_INFO_MS);
      hoverOn(toast);
      expect(scale(stepped('Message 1'))).toBe(1);
      act(() => void vi.advanceTimersByTime(20_000));
      expect(scale(stepped('Message 1')), 'still whole while held').toBe(1);
      fireEvent.pointerLeave(toast);
      act(() => void vi.advanceTimersByTime(1000));
      expect(scale(stepped('Message 1')), 'from the full time again').toBeCloseTo(1 - 1000 / TOAST_INFO_MS);
      act(() => screen.getByRole('button', { name: 'Undo' }).focus());
      expect(scale(stepped('Message 1'))).toBe(1);
    });

    it("starts after an error's edge strip", () => {
      render(<ToastRegion messages={[failure(2)]} dismiss={vi.fn()} />);
      expect(stepped('Failure 2').className).toContain(' left-1 ');
    });
  });

  it("starts after an error's edge strip, so the strip keeps its whole height, and takes the full width on an information toast", () => {
    const { rerender } = render(<ToastRegion messages={[failure(2)]} dismiss={vi.fn()} />);
    expect(bar('Failure 2').className).toContain(' left-1 ');
    rerender(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
    expect(bar('Message 1').className).toContain(' left-0 ');
  });
});

describe('ToastRegion text direction (issue 2957)', () => {
  it('lets the browser pick the direction of each message from its first strong letter', () => {
    render(<ToastRegion messages={[info(1, 'تم الحفظ')]} dismiss={vi.fn()} />);
    expect(screen.getByText('تم الحفظ').getAttribute('dir')).toBe('auto');
  });
});

describe('ToastRegion inside a modal (issue 2949)', () => {
  beforeEach(() => vi.useRealTimers());
  const open = () =>
    render(
      <>
        <Dialog dismissOnOutsidePress={false} title="Report" actions={<button>Done</button>}>
          <input aria-label="Name" />
        </Dialog>
        <ToastRegion messages={[failure(1)]} dismiss={vi.fn()} />
      </>,
    );

  it('Tab goes from the last control of the dialog to the toast and from the toast back into the dialog; Shift+Tab goes the other way', async () => {
    const user = userEvent.setup();
    open();
    const done = screen.getByRole('button', { name: 'Done' });
    const dismiss = screen.getByRole('button', { name: 'Dismiss message' });
    // Base UI settles focus a frame after it enters the popup (see tabInsideTrap); each step lets it, so it cannot move focus again under the next press.
    const settled = () => new Promise((resolve) => setTimeout(resolve, 60));
    await settled();
    done.focus();
    await settled();
    await user.tab();
    await waitFor(() => expect(document.activeElement).toBe(dismiss));
    await settled();
    await user.tab();
    // Back in the dialog: the library may put focus on the control that had it last, so only the dialog is asserted.
    await waitFor(() => expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull());
    await settled();
    (document.querySelector('[role="dialog"] [tabindex="0"]') as HTMLElement).focus();
    await settled();
    await user.tab({ shift: true });
    await waitFor(() => expect(document.activeElement).toBe(dismiss));
    await settled();
    await user.tab({ shift: true });
    await waitFor(() => expect(document.activeElement).toBe(done));
  });

  it('leaves the dialog’s own Tab loop alone when no toast is showing', async () => {
    const user = userEvent.setup();
    render(
      <Dialog dismissOnOutsidePress={false} title="Report" actions={<button>Done</button>}>
        <p>Body</p>
      </Dialog>,
    );
    screen.getByRole('button', { name: 'Done' }).focus();
    await tabInsideTrap(user);
  });
});

// #3431: every toast has a bounded lifetime. Whatever tone or `durationMs` a caller passes (none, zero, negative, NaN, Infinity, huge), the toast goes by TOAST_MAX_MS.
describe('toast lifetime', () => {
  const asks: Array<number | undefined> = [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER, 1, TOAST_ACTION_MS];
  for (const tone of ['info', 'error'] as const) {
    for (const durationMs of asks) {
      it(`${tone} with durationMs ${String(durationMs)} has a finite, positive lifetime of at most TOAST_MAX_MS, and is dismissed by then`, () => {
        const message: ToastMessage = { id: 1, text: 'Lifetime check', tone, durationMs };
        const stays = toastLifetimeMs(message);
        expect(Number.isFinite(stays)).toBe(true);
        expect(stays).toBeGreaterThan(0);
        expect(stays).toBeLessThanOrEqual(TOAST_MAX_MS);
        const dismiss = vi.fn();
        render(<ToastRegion messages={[message]} dismiss={dismiss} />);
        act(() => void vi.advanceTimersByTime(TOAST_MAX_MS));
        expect(dismiss).toHaveBeenCalledWith(1);
      });
    }
  }

  it('gives an error a longer default than an information message', () => {
    expect(toastLifetimeMs({ tone: 'error' })).toBe(TOAST_ERROR_MS);
    expect(toastLifetimeMs({ tone: 'info' })).toBe(TOAST_INFO_MS);
    expect(TOAST_ERROR_MS).toBeGreaterThan(TOAST_INFO_MS);
    expect(toastLifetimeMs({ tone: 'error', durationMs: 1 })).toBe(TOAST_ERROR_MS);
    expect(toastLifetimeMs({ tone: 'error', durationMs: TOAST_MAX_MS })).toBe(TOAST_MAX_MS);
  });
});

// Owner, 2026-11-16 (#3430): Escape closes the Booth and nothing else; a toast never closes on Escape (a toast that comes up must not make the key close the
// Booth by accident). A toast closes on its timer, which pauses while the pointer or focus is on it.
describe('Escape and a toast', () => {
  it('does not dismiss a toast that has focus, and the key reaches the page untouched', () => {
    const dismiss = vi.fn();
    const page = vi.fn();
    render(
      <div onKeyDown={page}>
        <ToastRegion messages={[failure(8), info(9)]} dismiss={dismiss} />
      </div>,
    );
    for (const button of screen.getAllByRole('button', { name: 'Dismiss message' })) {
      act(() => button.focus());
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(dismiss).not.toHaveBeenCalled();
    expect(page).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Failure 8')).toBeTruthy();
  });

  it('a toast with focus on its Retry button also keeps Escape for the page', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[{ ...failure(7), action: { label: 'Retry', onAction: vi.fn() } }]} dismiss={dismiss} />);
    const retry = screen.getByRole('button', { name: 'Retry' });
    act(() => retry.focus());
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    retry.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(dismiss).not.toHaveBeenCalled();
  });
});

describe('a hold that starts while the toast fades', () => {
  for (const tone of ['info', 'error'] as const) {
    for (const how of ['pointer', 'focus'] as const) {
      for (const offset of [0, 140, 149, 1]) {
        it(`${tone}, ${how} at ${offset} ms before its end: visible again while held, and a full lifetime after release (#3431)`, () => {
          const dismiss = vi.fn();
          const stays = tone === 'error' ? TOAST_ERROR_MS : TOAST_INFO_MS;
          render(<ToastRegion messages={[{ id: 1, text: 'Held', tone }]} dismiss={dismiss} />);
          const toast = screen.getByText('Held').closest('[data-tone]') as HTMLElement;
          act(() => void vi.advanceTimersByTime(stays - Math.max(offset, 1)));
          if (how === 'pointer') hoverOn(toast);
          else act(() => within(toast).getByRole('button', { name: 'Dismiss message' }).focus());
          act(() => void vi.advanceTimersByTime(1000));
          expect(toast.className).not.toContain('opacity-0');
          expect(dismiss).not.toHaveBeenCalled();
          if (how === 'pointer') fireEvent.pointerLeave(toast);
          else act(() => within(toast).getByRole('button', { name: 'Dismiss message' }).blur());
          act(() => void vi.advanceTimersByTime(stays - 1));
          expect(dismiss).not.toHaveBeenCalled();
          act(() => void vi.advanceTimersByTime(1));
          expect(dismiss).toHaveBeenCalledWith(1);
        });
      }
    }
  }
});

// #3605 / #3601: a dialog in a window under 300 px tall takes what is left above the toasts, so they publish how much of the window's bottom they take, but only
// while a toast shows over an open dialog: nothing in a normal window reads it or changes.
describe('the room the toasts take, published for a dialog in a short window', () => {
  const published = () => document.documentElement.style.getPropertyValue(TOAST_HEIGHT_PROPERTY);
  function Modal({ open }: { open: boolean }) {
    useToastsClearOfModal(open);
    return null;
  }
  afterEach(() => document.documentElement.style.removeProperty(TOAST_HEIGHT_PROPERTY));

  it('is set while a toast shows over an open dialog, in px, and goes with either', async () => {
    const { rerender } = render(
      <>
        <Modal open />
        <ToastRegion messages={[info(1)]} dismiss={vi.fn()} />
      </>,
    );
    expect(published()).toMatch(/^\d+px$/);
    rerender(
      <>
        <Modal open />
        <ToastRegion messages={[]} dismiss={vi.fn()} />
      </>,
    );
    expect(published()).toBe('');
    rerender(
      <>
        <Modal open />
        <ToastRegion messages={[info(1)]} dismiss={vi.fn()} />
      </>,
    );
    expect(published()).not.toBe('');
    rerender(
      <>
        <Modal open={false} />
        <ToastRegion messages={[info(1)]} dismiss={vi.fn()} />
      </>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    // The dialog closed, the toast stays: the shell's strip still holds the room it takes (#4063).
    expect(published()).toMatch(/^\d+px$/);
  });

  it('is set for a toast with no dialog open, held to 60% of the window, and not left behind when the region unmounts', () => {
    const { unmount } = render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
    expect(published()).toMatch(/^\d+px$/);
    expect(Number.parseInt(published(), 10)).toBeLessThanOrEqual(window.innerHeight * 0.6);
    unmount();
    expect(published()).toBe('');
    const modal = render(
      <>
        <Modal open />
        <ToastRegion messages={[info(1)]} dismiss={vi.fn()} />
      </>,
    );
    expect(published()).not.toBe('');
    modal.unmount();
    expect(published()).toBe('');
  });
});

// One toast shows in the slot, with a dialog open or not (#4063, #3605); the others wait behind it, in the order they were raised, and show one after another.
// (The rank and preemption tests of the earlier design, an Undo or a Retry error jumping the queue and a held toast yielding to an Undo, are gone: nothing jumps the queue now.)
describe('ToastRegion shows one toast and queues the rest', () => {
  const three = [info(1, 'First.'), failure(2, 'Second.'), info(3, 'Third.')];
  const retry = { label: 'Retry', onAction: vi.fn() };

  it.each([false, true])('shows the oldest, then the next as each goes (dialog open: %s)', (modal) => {
    if (modal) document.documentElement.setAttribute('data-modal-open', '');
    try {
      const { rerender } = render(<ToastRegion messages={three} dismiss={vi.fn()} />);
      expect(screen.getByText('First.', { selector: '[data-toast-text]' })).toBeTruthy();
      expect(screen.queryByText('Second.', { selector: '[data-toast-text]' })).toBeNull();
      expect(screen.queryByText('Third.', { selector: '[data-toast-text]' })).toBeNull();
      expect(screen.getByText('+2')).toBeTruthy();
      rerender(<ToastRegion messages={[three[1]!, three[2]!]} dismiss={vi.fn()} />);
      expect(screen.getByText('Second.', { selector: '[data-toast-text]' })).toBeTruthy();
      expect(screen.getByText('+1')).toBeTruthy();
      rerender(<ToastRegion messages={[three[2]!]} dismiss={vi.fn()} />);
      expect(screen.getByText('Third.', { selector: '[data-toast-text]' })).toBeTruthy();
      expect(screen.queryByText(/^\+\d/)).toBeNull();
    } finally {
      document.documentElement.removeAttribute('data-modal-open');
    }
  });

  it('a queued toast does not run its clock until it shows', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[info(1, 'Older.'), info(2, 'Newest.')]} dismiss={dismiss} />);
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS + 1));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith(1);
  });

  it('an Undo raised behind an error waits its turn and then shows for its whole time', () => {
    const dismiss = vi.fn();
    const error = { ...failure(1, 'Could not save.'), action: retry };
    const undo = { ...info(2, 'Removed A.'), action: { label: 'Undo', onAction: vi.fn() } };
    const { rerender } = render(<ToastRegion messages={[error, undo]} dismiss={dismiss} />);
    expect(screen.queryByText('Removed A.', { selector: '[data-toast-text]' })).toBeNull();
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS + 1));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(1);
    rerender(<ToastRegion messages={[undo]} dismiss={dismiss} />);
    dismiss.mockClear();
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS - 1));
    expect(dismiss).not.toHaveBeenCalled();
    expect(screen.getByText('Removed A.', { selector: '[data-toast-text]' })).toBeTruthy();
  });

  it('shows an error with its Retry and a count of the information waiting behind it, and no more than one toast', () => {
    render(<ToastRegion messages={[{ ...failure(1, 'Could not save.'), action: retry }, info(2, 'Saved elsewhere.')]} dismiss={vi.fn()} />);
    expect(screen.getByText('Could not save.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByText('Saved elsewhere.', { selector: '[data-toast-text]' })).toBeNull();
    expect(screen.getByText('+1').closest('[data-toast-more]')!.getAttribute('aria-label')).toBe('1 more message waiting');
    expect(screen.getAllByRole('button', { name: 'Dismiss message' })).toHaveLength(1);
  });
});

describe('a toast is never lost unseen, never pressed twice, and never takes a key it does not own (#4063)', () => {
  const retry = { label: 'Retry', onAction: vi.fn() };
  const drawnText = () => [...document.querySelectorAll('[data-toast-region] [data-tone]:not([hidden]) [data-toast-text]')].map((el) => el.textContent);

  it('three errors queued together each show for their whole time, one after the other', () => {
    const dismiss = vi.fn();
    const errors = [1, 2, 3].map((id) => ({ ...failure(id, `Error ${id}`), action: retry }));
    const { rerender } = render(<ToastRegion messages={errors} dismiss={dismiss} />);
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS + 1));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(1);
    rerender(<ToastRegion messages={errors.slice(1)} dismiss={dismiss} />);
    expect(drawnText()).toEqual(['Error 2']);
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS - 1));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(drawnText()).toEqual(['Error 2']);
  });

  it('a message that waits is read out at once, without being drawn', () => {
    render(<ToastRegion messages={[{ ...failure(1, 'First error.'), action: retry }, failure(2, 'Second error.'), info(3, 'A note.')]} dismiss={vi.fn()} />);
    const alert = document.querySelector('[role="alert"]')!;
    const status = document.querySelector('[role="status"]')!;
    expect(alert.querySelector('[data-toast-announce]')!.textContent).toBe('Second error.');
    expect(status.querySelector('[data-toast-announce]')!.textContent).toBe('A note.');
    expect(drawnText()).toEqual(['First error.']);
  });

  it('names the count for a screen reader, with the plural of the shared helper', () => {
    render(<ToastRegion messages={[failure(1), failure(2), failure(3)]} dismiss={vi.fn()} />);
    expect(document.querySelector('[data-toast-more]')!.getAttribute('aria-label')).toBe('2 more messages waiting');
  });

  it.each(['Dismiss message', 'Retry'])('a key held down on %s presses it once: the repeats are cancelled', (name) => {
    const action = vi.fn();
    render(<ToastRegion messages={[{ ...failure(1, 'Held.'), action: { label: 'Retry', onAction: action } }]} dismiss={vi.fn()} />);
    const button = screen.getByRole('button', { name });
    expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(button, { key: 'Enter', repeat: true })).toBe(false);
  });

  it('focus is handed back only after a held key comes up', () => {
    render(
      <>
        <button>Page</button>
        <ToastRegion messages={[{ ...failure(1, 'Held.'), action: retry }]} dismiss={vi.fn()} />
      </>,
    );
    const page = screen.getByText('Page');
    page.focus();
    const dismissButton = screen.getByRole('button', { name: 'Dismiss message' });
    dismissButton.focus();
    // A browser's key events always carry the key's `code`: the wait is for that key's own coming up.
    fireEvent.keyDown(dismissButton, { key: 'Enter', code: 'Enter' });
    fireEvent.click(dismissButton, { detail: 0 });
    act(() => void vi.advanceTimersByTime(1_000));
    expect(document.activeElement).toBe(dismissButton);
    fireEvent.keyUp(dismissButton, { key: 'Enter', code: 'Enter' });
    act(() => void vi.advanceTimersByTime(10));
    expect(document.activeElement).toBe(page);
  });

  it('the second click of a double click does nothing: the next toast took the slot under the pointer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = { ...failure(1, 'Alpha'), action: { label: 'Retry', onAction: first } };
    const b = { ...failure(2, 'Beta'), action: { label: 'Retry', onAction: second } };
    const dismiss = vi.fn();
    const { rerender } = render(<ToastRegion messages={[a, b]} dismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }), { detail: 1 });
    expect(first).toHaveBeenCalledTimes(1);
    rerender(<ToastRegion messages={[b]} dismiss={dismiss} />);
    // Beta took the slot under the pointer: the second click of the double click lands on it.
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }), { detail: 2 });
    expect(second).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }), { detail: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('a keyboard action whose origin is gone puts focus on the toast that took the slot, else on <main>', () => {
    document.body.insertAdjacentHTML('beforeend', '<main id="main-content" tabindex="-1"></main>');
    try {
      const gone = document.createElement('button');
      document.body.append(gone);
      gone.focus();
      const a = failure(1, 'Alpha');
      const { rerender } = render(<ToastRegion messages={[a, failure(2, 'Beta')]} dismiss={vi.fn()} />);
      const dismissButton = screen.getByRole('button', { name: 'Dismiss message' });
      dismissButton.focus();
      gone.remove();
      fireEvent.click(dismissButton, { detail: 0 });
      rerender(<ToastRegion messages={[failure(2, 'Beta')]} dismiss={vi.fn()} />);
      act(() => void vi.advanceTimersByTime(10));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss message' }));
      const only = screen.getByRole('button', { name: 'Dismiss message' });
      only.focus();
      fireEvent.click(only, { detail: 0 });
      rerender(<ToastRegion messages={[]} dismiss={vi.fn()} />);
      act(() => void vi.advanceTimersByTime(10));
      expect(document.activeElement).toBe(document.getElementById('main-content'));
    } finally {
      document.getElementById('main-content')?.remove();
    }
  });

  it('every repeat of a key is cancelled, wherever focus has gone, after a key pressed a toast button, until a key comes up', () => {
    render(
      <>
        <button>Page</button>
        <ToastRegion messages={[{ ...failure(1, 'Held.'), action: retry }]} dismiss={vi.fn()} />
      </>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Retry' }), { key: 'Enter' });
    const page = screen.getByText('Page');
    expect(fireEvent.keyDown(page, { key: 'Enter', repeat: true })).toBe(false);
    fireEvent.keyUp(page, { key: 'Enter' });
    expect(fireEvent.keyDown(page, { key: 'Enter', repeat: true })).toBe(true);
  });

  it('the same message raised again while its toast has focus puts focus on the toast that replaced it, never on <body>', () => {
    const { rerender } = render(<ToastRegion messages={[failure(1, 'Same.')]} dismiss={vi.fn()} />);
    screen.getByRole('button', { name: 'Dismiss message' }).focus();
    rerender(<ToastRegion messages={[failure(2, 'Same.')]} dismiss={vi.fn()} />);
    act(() => void vi.advanceTimersByTime(10));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss message' }));
  });

  it.each(['Retry', 'Dismiss message'])(
    'the same message raised again while its %s has focus keeps focus on that control of the replacing toast, not on the control focus came from',
    (name) => {
      const retry = retryAction(vi.fn());
      const { rerender } = render(
        <>
          <button>Page</button>
          <ToastRegion messages={[{ ...failure(1, 'Same.'), action: retry }]} dismiss={vi.fn()} />
        </>,
      );
      const page = screen.getByText('Page');
      page.focus();
      const target = screen.getByRole('button', { name });
      fireEvent.focus(target, { relatedTarget: page });
      target.focus();
      rerender(
        <>
          <button>Page</button>
          <ToastRegion messages={[{ ...failure(2, 'Same.'), action: retry }]} dismiss={vi.fn()} />
        </>,
      );
      act(() => void vi.advanceTimersByTime(10));
      expect(document.activeElement).toBe(screen.getByRole('button', { name }));
    },
  );
});
