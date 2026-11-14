// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';
import { tabInsideTrap } from './tabInsideTrap';
import { ACTION_FOCUS_MS, TOAST_ACTION_MS, TOAST_ERROR_MS, TOAST_INFO_MS, TOAST_MAX_MS, ToastRegion, toastLifetimeMs, type ToastMessage } from './Toast';

beforeEach(() => vi.useFakeTimers());
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
    render(<ToastRegion messages={[info(1, 'Saved.'), failure(2, 'Could not save.')]} dismiss={vi.fn()} />);
    expect(within(screen.getByRole('alert')).getByText('Could not save.')).toBeTruthy();
    expect(within(screen.getByRole('status')).getByText('Saved.')).toBeTruthy();
    expect(within(screen.getByRole('status')).queryByText('Could not save.')).toBeNull();
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
    fireEvent.pointerEnter(toast);
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS * 3));
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(toast);
    act(() => void vi.advanceTimersByTime(TOAST_ERROR_MS - 1));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(4);
  });

  it('dismisses the toast that has focus on Escape, and leaves the key to it', () => {
    const dismiss = vi.fn();
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <ToastRegion messages={[failure(5), failure(6)]} dismiss={dismiss} />
      </div>,
    );
    within(screen.getByText('Failure 6').closest('[data-tone]') as HTMLElement)
      .getByRole('button', { name: 'Dismiss message' })
      .focus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(6);
    expect(outer).not.toHaveBeenCalled();
  });

  it('dismisses the message whose button was pressed', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[failure(1), failure(2)]} dismiss={dismiss} />);
    fireEvent.click(within(screen.getByText('Failure 2').closest('[data-tone]') as HTMLElement).getByRole('button', { name: 'Dismiss message' }));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(2);
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

  it('starts a message over when it is replaced by one with a new id, and shows the whole queue at once', () => {
    const dismiss = vi.fn();
    const { rerender } = render(<ToastRegion messages={[info(1, 'Same'), info(2, 'Other')]} dismiss={dismiss} />);
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS - 500));
    rerender(<ToastRegion messages={[info(2, 'Other'), info(3, 'Same')]} dismiss={dismiss} />);
    act(() => void vi.advanceTimersByTime(600));
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(2);
    expect(screen.getAllByRole('button', { name: 'Dismiss message' })).toHaveLength(2);
  });

  it('leads an information message with its icon, and an error with its warning glyph only', () => {
    render(
      <ToastRegion
        messages={[
          { ...info(1, 'Linked.'), icon: faLayerGroup },
          { ...failure(2), icon: faLayerGroup },
        ]}
        dismiss={vi.fn()}
      />,
    );
    expect(within(screen.getByRole('status')).getByText('Linked.').parentElement!.querySelector('svg[data-icon="layer-group"]')).not.toBeNull();
    const error = within(screen.getByRole('alert')).getByText('Failure 2').parentElement!;
    expect(error.querySelector('svg[data-icon="circle-exclamation"]')).not.toBeNull();
    expect(error.querySelector('svg[data-icon="layer-group"]')).toBeNull();
  });

  // Alignment audit cause P: a toast at the bottom right covered an open dialog's Cancel and Download buttons. The behaviour changed: it moved to the
  // top of the window, where it covered the top bar's buttons (R4BO2-4); now the dialog hangs from the top and stops 4.75rem short of the bottom, and
  // the toast keeps to the bottom-right corner at the gutter, ignoring the bottom bars behind the scrim.
  it('keeps to the bottom-right corner at the gutter while a dialog is open, and follows the bars again when the last one closes', () => {
    render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
    const region = screen.getByText('Message 1').closest('[data-toast-region]') as HTMLElement;
    expect(region.className).toContain('[:root[data-modal-open]_&]:bottom-[var(--page-gutter)]');
    expect(region.className).toContain('[:root[data-modal-open]_&]:right-[var(--page-gutter)]');
    expect(region.className).not.toContain('top-4');
    // The bottom offset follows the bars through `--toast-reserve`, which is `--toast-clear` capped so the toasts keep 8rem of the window (#2899).
    expect(region.className).toContain('bottom-[calc(var(--page-gutter)+var(--toast-reserve,0px))]');
    expect(region.style.getPropertyValue('--toast-reserve')).toContain('var(--toast-clear, 0px)');
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

  it('lets a long unbroken message wrap inside the toast and keeps the toast within the window (#2793)', () => {
    render(<ToastRegion messages={[info(1, `C:\\${'LongFolder\\'.repeat(40)}`)]} dismiss={vi.fn()} />);
    const text = screen.getByText(/^C:/);
    expect(text.className).toContain('[overflow-wrap:anywhere]');
    expect(text.closest('[data-tone]')?.className).toContain('max-w-full');
  });
});

describe('ToastRegion sharing a small window between toasts (issue 2899)', () => {
  it.each([1, 2, 5])('tells its CSS how many toasts share the window: %i', (n) => {
    render(<ToastRegion messages={Array.from({ length: n }, (_, i) => failure(i + 1))} dismiss={vi.fn()} />);
    expect((document.querySelector('[data-toast-region]') as HTMLElement).style.getPropertyValue('--toast-n')).toBe(String(n));
  });
  it('counts one toast when there are none, so the cap never divides by zero', () => {
    render(<ToastRegion messages={[]} dismiss={vi.fn()} />);
    expect((document.querySelector('[data-toast-region]') as HTMLElement).style.getPropertyValue('--toast-n')).toBe('1');
  });
});

describe('ToastRegion with a message far taller than the window (issue 2899)', () => {
  const HUGE = 'x'.repeat(10_000);
  const textOf = (id: string) => screen.getByText(id, { exact: false }).closest('[data-toast-text]') as HTMLElement;

  it.each([
    ['one 10,000-letter word', HUGE],
    ['emoji and right-to-left text', 'שלום \u{1F3A4} '.repeat(2_000)],
  ])('wraps %s anywhere and caps the text to the window, scrolling inside the toast', (_name, text) => {
    render(<ToastRegion messages={[{ ...failure(1, text), action: { label: 'Retry', onAction: vi.fn() } }]} dismiss={vi.fn()} />);
    const el = document.querySelector('[data-toast-text]') as HTMLElement;
    expect(el.className).toContain('[overflow-wrap:anywhere]');
    expect(el.className).toContain('overflow-y-auto');
    expect(el.className).toContain('--toast-n');
    expect(el.className).toContain('max-h-[max(1.5rem,calc(');
    // The action and Dismiss are siblings of the scrolling text, so they never scroll away with it.
    expect(within(el.parentElement!).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(within(el.parentElement!).getByRole('button', { name: 'Dismiss message' })).toBeTruthy();
    expect(el.contains(screen.getByRole('button', { name: 'Retry' }))).toBe(false);
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
    sizes.scrollHeight = 500;
    act(() => observers.forEach((cb) => cb()));
    expect(textOf('xxxx').getAttribute('tabindex')).toBe('0');
    scrollHeight.mockRestore();
    clientHeight.mockRestore();
    vi.unstubAllGlobals();
  });

  it('leaves an ordinary short message out of the tab order', () => {
    render(<ToastRegion messages={[info(1, 'Entry saved.')]} dismiss={vi.fn()} />);
    expect(textOf('Entry saved.').getAttribute('tabindex')).toBeNull();
  });
});

describe('ToastRegion, action labels and focus (issue 2899)', () => {
  it('caps a long action label at a share of the toast and wraps it, so Dismiss and the message keep their room', () => {
    render(
      <ToastRegion
        messages={[{ ...failure(1, 'Failed'), action: { label: `Retry ${'the whole export again '.repeat(10)}`, onAction: vi.fn() } }]}
        dismiss={vi.fn()}
      />,
    );
    const action = screen.getByRole('button', { name: /^Retry the whole/ });
    // Natural width for a short label (flex-none: it never shrinks to a sliver and wraps letter by letter), a cap at 40% of the toast for a long one, which then wraps.
    expect(action.className).toContain('max-w-[40%]');
    expect(action.className).toContain('flex-none');
    expect(action.className).toContain('[overflow-wrap:anywhere]');
    // Never more than three lines, whatever the label: the whole label is the button's title.
    expect(action.className).toContain('line-clamp-3');
    expect(action.getAttribute('title')).toMatch(/^Retry the whole export again/);
    expect(screen.getByRole('button', { name: 'Dismiss message' }).className).toContain('flex-none');
  });

  it('moves focus to the next toast’s Dismiss when the focused one is dismissed, else the one before, and leaves it alone when a pointer dismissed a toast that had no focus', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[failure(1), failure(2), failure(3)]} dismiss={dismiss} />);
    const buttons = screen.getAllByRole('button', { name: 'Dismiss message' });
    buttons[1]!.focus();
    fireEvent.click(buttons[1]!);
    act(() => void vi.advanceTimersByTime(1));
    expect(dismiss).toHaveBeenLastCalledWith(2);
    expect(document.activeElement).toBe(buttons[2]);
    buttons[2]!.focus();
    fireEvent.click(buttons[2]!);
    act(() => void vi.advanceTimersByTime(1));
    expect(document.activeElement).toBe(buttons[1]);
    // A click that did not have focus moves nothing.
    (document.activeElement as HTMLElement).blur();
    fireEvent.click(buttons[0]!);
    act(() => void vi.advanceTimersByTime(1));
    expect(document.activeElement).toBe(document.body);
  });
});

describe('ToastRegion under a hand or a key (issue 2956)', () => {
  it('holds the timer while the pointer is on the toast and starts the full time again when it leaves', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[info(1)]} dismiss={dismiss} />);
    const toast = screen.getByText('Message 1').closest('[data-tone]')!;
    fireEvent.pointerEnter(toast);
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

describe('Escape on a focused toast', () => {
  it('is not taken by a capture-phase Escape listener of the page: the listeners that close a panel skip a key from a toast (#3431)', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[failure(8)]} dismiss={dismiss} />);
    const button = screen.getByRole('button', { name: 'Dismiss message' });
    button.focus();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    // The key is the toast's: it is handled (default prevented) so a page-level Escape that checks `defaultPrevented` leaves it alone.
    expect(event.defaultPrevented).toBe(true);
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
          if (how === 'pointer') fireEvent.pointerEnter(toast);
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
