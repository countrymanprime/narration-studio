// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Highlight } from './Highlight';
import { danglingAriaReferences } from './ariaReferences';
import { Tooltip, TooltipProvider, TooltipTarget } from './Tooltip';

afterEach(() => {
  // jsdom keeps :focus-visible state on the element that was focused last; drop it so the next test starts clean.
  (document.activeElement as HTMLElement | null)?.blur();
  cleanup();
  vi.useRealTimers();
});

const TEXT = 'Helpful tooltip guidance';

describe('the info icon (Tooltip)', () => {
  it('is a real button whose text is its accessible description', () => {
    render(<Tooltip text={TEXT} />);
    const icon = screen.getByRole('button', { name: 'More information' });
    expect(icon.tagName).toBe('BUTTON');
    // Its text is its description, so a screen reader hears it without the popup being open.
    expect(icon.getAttribute('aria-description')).toBe(TEXT);
  });

  it('takes the name a page gives it, so two icons can be told apart', () => {
    render(
      <>
        <Tooltip text={TEXT} label="About this" />
        <Tooltip text={TEXT} label="About reference material" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'About this' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About reference material' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'More information' })).toBeNull();
  });

  it('swaps the "i" glyph for a custom icon while keeping the same button contract (R11)', () => {
    render(<Tooltip text={TEXT} label="Text size" icon={<span data-testid="custom-icon">F</span>} />);
    const button = screen.getByRole('button', { name: 'Text size' });
    expect(button.querySelector('[data-testid="custom-icon"]')).toBeTruthy();
    expect(button.textContent).not.toContain('i');
  });

  it('shows its text as a tooltip when the keyboard reaches it, and Escape hides it', async () => {
    const user = userEvent.setup();
    render(<Tooltip text={TEXT} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More information' }));
    expect((await screen.findByRole('tooltip')).textContent).toBe(TEXT);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More information' }));
  });

  it('after Escape a press opens the note again and the next press closes it (Escape forgets that focus opened it)', async () => {
    const user = userEvent.setup();
    render(<Tooltip text={TEXT} />);
    await user.tab();
    await screen.findByRole('tooltip');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.keyboard('{Enter}');
    await screen.findByRole('tooltip');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('hides the tooltip again when focus leaves, and focus lands on the next control', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip text={TEXT} />
        <button>Next</button>
      </>,
    );
    await user.tab();
    await screen.findByRole('tooltip');
    await user.tab();
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
  });

  it('keeps the tooltip open when Enter is pressed on an icon the keyboard just opened, and a second Enter closes it', async () => {
    const user = userEvent.setup();
    render(<Tooltip text={TEXT} />);
    await user.tab();
    await screen.findByRole('tooltip');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('tooltip')).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays open when focus moves onto its own popup', async () => {
    const user = userEvent.setup();
    render(<Tooltip text={TEXT} />);
    await user.tab();
    const popup = await screen.findByRole('tooltip');
    popup.focus();
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('opens on a press and closes on a second press', async () => {
    const user = userEvent.setup();
    render(<Tooltip text={TEXT} />);
    const icon = screen.getByRole('button', { name: 'More information' });
    await user.click(icon);
    expect((await screen.findByRole('tooltip')).textContent).toBe(TEXT);
    expect(icon.getAttribute('aria-expanded')).toBe('true');
    await user.click(icon);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('waits a second for a resting pointer', async () => {
    vi.useFakeTimers();
    render(<Tooltip text={TEXT} />);
    const icon = screen.getByRole('button', { name: 'More information' });
    fireEvent.mouseEnter(icon);
    fireEvent.mouseMove(icon);
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(screen.queryByRole('tooltip')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(screen.getByRole('tooltip').textContent).toBe(TEXT);
  });

  it('clears its popup on unmount instead of leaving it stuck (e.g. a click that navigates away)', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Tooltip text="Jump to script in Manuscript" />);
    await user.tab();
    await screen.findByRole('tooltip');
    unmount();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('leaves no dangling aria reference', async () => {
    const user = userEvent.setup();
    render(<Tooltip text={TEXT} />);
    expect(danglingAriaReferences()).toEqual([]);
    await user.tab();
    await screen.findByRole('tooltip');
    expect(danglingAriaReferences()).toEqual([]);
  });
});

describe('TooltipTarget', () => {
  const target = (
    <TooltipProvider>
      <TooltipTarget text="View manuscript">
        <button aria-label="View manuscript">V</button>
      </TooltipTarget>
    </TooltipProvider>
  );

  it('shows the hint at once on keyboard focus and hides it on blur', async () => {
    const user = userEvent.setup();
    render(target);
    await user.tab();
    expect((await screen.findByRole('tooltip')).textContent).toBe('View manuscript');
    await user.tab();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('waits a full second of hover, and a pointer that leaves early shows nothing', async () => {
    vi.useFakeTimers();
    render(target);
    // The pointer enters the hint's own element (the wrapper around the button); a real pointer crossing the button does too.
    const trigger = screen.getByRole('button', { name: 'View manuscript' }).parentElement as HTMLElement;
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseMove(trigger);
    await act(() => vi.advanceTimersByTimeAsync(990));
    expect(screen.queryByRole('tooltip')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.mouseLeave(trigger);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(trigger);
    fireEvent.mouseMove(trigger);
    await act(() => vi.advanceTimersByTimeAsync(500));
    fireEvent.mouseLeave(trigger);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hoverDelayMs sets the rest a hover needs, and the default stays a second', async () => {
    vi.useFakeTimers();
    render(
      <TooltipProvider>
        <TooltipTarget text="Quick" hoverDelayMs={200}>
          <button aria-label="Quick one">q</button>
        </TooltipTarget>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Quick one' }).parentElement as HTMLElement;
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseMove(trigger);
    await act(() => vi.advanceTimersByTimeAsync(150));
    expect(screen.queryByRole('tooltip')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByRole('tooltip').textContent).toBe('Quick');
  });

  it('leaves the child alone: its own accessible name is untouched and no aria reference dangles', async () => {
    const user = userEvent.setup();
    render(target);
    expect(screen.getByRole('button', { name: 'View manuscript' }).getAttribute('aria-describedby')).toBeNull();
    await user.tab();
    await screen.findByRole('tooltip');
    expect(danglingAriaReferences()).toEqual([]);
  });

  it('makes the wrapper of a disabled child the tab stop and names it with the reason', async () => {
    const user = userEvent.setup();
    render(
      <TooltipTarget text="Import a manuscript to unlock Proofing.">
        <button aria-label="Open Proofing" disabled>
          Proofing
        </button>
      </TooltipTarget>,
    );
    const wrapper = screen.getByRole('group', { name: 'Import a manuscript to unlock Proofing.' });
    expect(wrapper.getAttribute('tabindex')).toBe('0');
    await user.tab();
    expect(document.activeElement).toBe(wrapper);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Import a manuscript to unlock Proofing.');
  });

  it('Escape dismisses a hint without moving focus, and a click closes it', async () => {
    const user = userEvent.setup();
    render(target);
    const button = screen.getByRole('button', { name: 'View manuscript' });
    await user.tab();
    await screen.findByRole('tooltip');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(button);
    await user.tab({ shift: true });
    await user.tab();
    await screen.findByRole('tooltip');
    await user.click(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('clears the hint on unmount instead of leaving it stuck', async () => {
    const user = userEvent.setup();
    const { unmount } = render(target);
    await user.tab();
    await screen.findByRole('tooltip');
    unmount();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('gives an enabled child no wrapper role or tab stop', () => {
    render(target);
    const wrapper = screen.getByRole('button', { name: 'View manuscript' }).parentElement;
    expect(wrapper?.getAttribute('tabindex')).toBeNull();
    expect(wrapper?.getAttribute('role')).toBeNull();
  });
});

// The inline (flowing text) mode (for hints on marks inside running text): the trigger is an inline box, so a mark
// that wraps across lines keeps flowing with the text around it, and the hint follows the mark inside it the same way it follows a button.
describe('TooltipTarget inline', () => {
  const inline = (
    <p>
      Alice was{' '}
      <TooltipTarget text="Heard: begging" inline>
        <Highlight kind="Misread" onActivate={() => {}}>
          beginning
        </Highlight>
      </TooltipTarget>{' '}
      to get very tired.
    </p>
  );

  it('flows with the line instead of becoming a flex box', () => {
    render(inline);
    const wrapper = screen.getByRole('button', { name: 'beginning' }).parentElement;
    expect(wrapper?.tagName).toBe('SPAN');
    expect(wrapper?.className.split(' ')).toContain('inline');
    expect(wrapper?.className.split(' ')).not.toContain('inline-flex');
  });

  it('shows the hint on keyboard focus of the mark and hides it on Escape without moving focus', async () => {
    const user = userEvent.setup();
    render(inline);
    await user.tab();
    const mark = screen.getByRole('button', { name: 'beginning' });
    expect(document.activeElement).toBe(mark);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Heard: begging');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(document.activeElement).toBe(mark);
  });
});

describe('a hint inside a dialog', () => {
  it('takes Escape first: the hint closes and the dialog stays until the next Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog dismissOnOutsidePress={false} title="Add note" onClose={onClose} actions={<Button variant="primary">Save</Button>}>
        <Tooltip text={TEXT} />
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add note' });
    // Focus starts on the dialog body; one Tab reaches the info icon inside it.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More information' }));
    await screen.findByRole('tooltip');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// #3310: the Production table draws about 350 hints for a 17 h book, and mounting the Base UI tooltip for each cost about a
// third of the page's JS. A hint now mounts it on the first hover or keyboard focus. The marker below is set by the library's
// trigger on the element it controls, so counting it counts the tooltips the library has mounted.
describe('TooltipTarget mounts the library lazily', () => {
  const MOUNTED = '[data-base-ui-tooltip-trigger]';
  const mountedCount = () => document.querySelectorAll(MOUNTED).length;

  function Rows({ count }: { count: number }) {
    return (
      <>
        {Array.from({ length: count }, (_, i) => (
          <TooltipTarget key={i} text={`Hint ${i}`}>
            <button aria-label={`Row ${i}`}>r</button>
          </TooltipTarget>
        ))}
      </>
    );
  }

  it('mounts no library tooltip for any number of rows until one is used, then exactly one', async () => {
    const user = userEvent.setup();
    const sizes = [1, 10, 100, 400];
    for (const n of sizes) {
      const { unmount } = render(<Rows count={n} />);
      expect(mountedCount()).toBe(0);
      unmount();
    }
    render(<Rows count={400} />);
    await user.tab();
    expect((await screen.findByRole('tooltip')).textContent).toBe('Hint 0');
    expect(mountedCount()).toBe(1);
    await user.tab();
    await user.tab();
    expect(mountedCount()).toBe(3);
  });

  it('draws a few hundred hints in a fraction of what mounting every tooltip took (median of runs, relative to the old cost)', () => {
    // The same machine times both, so the ratio holds on a slow runner; the old cost is measured here by mounting the library
    // for every row, which is what each hint used to do.
    const eager = (n: number) => (
      <>
        {Array.from({ length: n }, (_, i) => (
          <BaseTooltip.Root key={i}>
            <BaseTooltip.Trigger delay={1000} render={<span />}>
              <button aria-label={`Row ${i}`}>r</button>
            </BaseTooltip.Trigger>
            <BaseTooltip.Portal>
              <BaseTooltip.Positioner>
                <BaseTooltip.Popup>{`Hint ${i}`}</BaseTooltip.Popup>
              </BaseTooltip.Positioner>
            </BaseTooltip.Portal>
          </BaseTooltip.Root>
        ))}
      </>
    );
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
    const time = (ui: ReactNode) => {
      const start = performance.now();
      const { unmount } = render(ui);
      const ms = performance.now() - start;
      unmount();
      return ms;
    };
    time(eager(20));
    time(<Rows count={20} />);
    const old: number[] = [];
    const lazy: number[] = [];
    for (let run = 0; run < 7; run++) {
      old.push(time(eager(350)));
      lazy.push(time(<Rows count={350} />));
    }
    // Measured about 0.25; the bound leaves room for a noisy runner and still fails if every row mounts the library again.
    expect(median(lazy)).toBeLessThan(median(old) * 0.6);
  });

  it('starts the one second delay on the first hover, even when the pointer then rests', async () => {
    vi.useFakeTimers();
    render(<Rows count={3} />);
    const wrapper = screen.getByRole('button', { name: 'Row 1' }).parentElement as HTMLElement;
    // A real pointer raises pointerenter, then mouseenter, then mousemove, and then rests.
    fireEvent.pointerEnter(wrapper, { pointerType: 'mouse' });
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseMove(wrapper);
    expect(mountedCount()).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(990));
    expect(screen.queryByRole('tooltip')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(screen.getByRole('tooltip').textContent).toBe('Hint 1');
    expect(danglingAriaReferences()).toEqual([]);
  });

  it('starts the delay when the first event is a pen or a mouse event with no pointer event before it', async () => {
    vi.useFakeTimers();
    render(<Rows count={2} />);
    const pen = screen.getByRole('button', { name: 'Row 0' }).parentElement as HTMLElement;
    fireEvent.pointerEnter(pen, { pointerType: 'pen' });
    await act(() => vi.advanceTimersByTimeAsync(1010));
    expect(screen.getByRole('tooltip').textContent).toBe('Hint 0');
    fireEvent.mouseLeave(pen);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.queryByRole('tooltip')).toBeNull();
    const plain = screen.getByRole('button', { name: 'Row 1' }).parentElement as HTMLElement;
    fireEvent.mouseEnter(plain);
    await act(() => vi.advanceTimersByTimeAsync(1010));
    expect(screen.getByRole('tooltip').textContent).toBe('Hint 1');
  });

  it('shows nothing for a pointer that leaves before the second is up, on the first hover and on the next', async () => {
    vi.useFakeTimers();
    render(<Rows count={1} />);
    const wrapper = screen.getByRole('button', { name: 'Row 0' }).parentElement as HTMLElement;
    for (let pass = 0; pass < 2; pass++) {
      fireEvent.pointerEnter(wrapper, { pointerType: 'mouse' });
      fireEvent.mouseEnter(wrapper);
      fireEvent.mouseMove(wrapper);
      await act(() => vi.advanceTimersByTimeAsync(600));
      fireEvent.mouseLeave(wrapper);
      await act(() => vi.advanceTimersByTimeAsync(1500));
      expect(screen.queryByRole('tooltip')).toBeNull();
    }
  });

  it('never opens for a touch: not on the touch itself, nor on the mouse events a tap emulates after it', async () => {
    vi.useFakeTimers();
    render(<Rows count={1} />);
    const wrapper = screen.getByRole('button', { name: 'Row 0' }).parentElement as HTMLElement;
    fireEvent.pointerEnter(wrapper, { pointerType: 'touch' });
    fireEvent.pointerDown(wrapper, { pointerType: 'touch' });
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseMove(wrapper);
    fireEvent.click(wrapper);
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(mountedCount()).toBe(0);
  });

  it('keeps the child, its focus and its state when the library mounts on keyboard focus', async () => {
    const user = userEvent.setup();
    let mounts = 0;
    function Counter() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <button aria-label="Counter">c</button>;
    }
    render(
      <TooltipTarget text="Counts">
        <Counter />
      </TooltipTarget>,
    );
    const button = screen.getByRole('button', { name: 'Counter' });
    const wrapper = button.parentElement;
    await user.tab();
    expect(document.activeElement).toBe(button);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Counts');
    // The same elements, not copies: nothing the narrator was doing in the control is lost.
    expect(screen.getByRole('button', { name: 'Counter' })).toBe(button);
    expect(button.parentElement).toBe(wrapper);
    expect(document.activeElement).toBe(button);
    expect(mounts).toBe(1);
  });

  it('keeps a typed value when the first hover mounts the library', () => {
    render(
      <TooltipTarget text="Name">
        <input aria-label="Name field" />
      </TooltipTarget>,
    );
    const input = screen.getByRole('textbox', { name: 'Name field' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Alice' } });
    fireEvent.pointerEnter(input.parentElement as HTMLElement, { pointerType: 'mouse' });
    expect(mountedCount()).toBe(1);
    expect(screen.getByRole('textbox', { name: 'Name field' })).toBe(input);
    expect(input.value).toBe('Alice');
  });

  it('opens a hint whose wrapper is the tab stop (a disabled child) on the first Tab, like the library did', async () => {
    const user = userEvent.setup();
    render(
      <TooltipTarget text="Why not">
        <button disabled>No</button>
      </TooltipTarget>,
    );
    expect(mountedCount()).toBe(0);
    await user.tab();
    expect((await screen.findByRole('tooltip')).textContent).toBe('Why not');
  });

  it('follows a change of text and of the delay after the library has mounted', async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <TooltipTarget text="Before" hoverDelayMs={200}>
        <button aria-label="Changing">c</button>
      </TooltipTarget>,
    );
    const wrapper = screen.getByRole('button', { name: 'Changing' }).parentElement as HTMLElement;
    fireEvent.pointerEnter(wrapper, { pointerType: 'mouse' });
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseMove(wrapper);
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByRole('tooltip').textContent).toBe('Before');
    rerender(
      <TooltipTarget text="After" hoverDelayMs={200}>
        <button aria-label="Changing">c</button>
      </TooltipTarget>,
    );
    expect(screen.getByRole('tooltip').textContent).toBe('After');
  });

  it('lets a hint inside a hint show only the inner one over the inner control', async () => {
    vi.useFakeTimers();
    render(
      <TooltipTarget text="Outer">
        <span>
          <TooltipTarget text="Inner">
            <button aria-label="Inner control">i</button>
          </TooltipTarget>
        </span>
      </TooltipTarget>,
    );
    const inner = screen.getByRole('button', { name: 'Inner control' }).parentElement as HTMLElement;
    fireEvent.pointerEnter(inner, { pointerType: 'mouse' });
    fireEvent.mouseEnter(inner);
    fireEvent.mouseMove(inner);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const tips = screen.getAllByRole('tooltip').map((t) => t.textContent);
    expect(tips).toEqual(['Inner']);
  });

  it('shows only the inner hint when the pointer moves from the outer one (already mounted) onto the inner one', async () => {
    vi.useFakeTimers();
    render(
      <TooltipTarget text="Outer">
        <span data-testid="outer-body">
          <TooltipTarget text="Inner">
            <button aria-label="Inner control">i</button>
          </TooltipTarget>
        </span>
      </TooltipTarget>,
    );
    const body = screen.getByTestId('outer-body');
    const outer = body.parentElement as HTMLElement;
    const inner = screen.getByRole('button', { name: 'Inner control' }).parentElement as HTMLElement;
    fireEvent.pointerEnter(outer, { pointerType: 'mouse' });
    fireEvent.mouseEnter(outer);
    fireEvent.mouseMove(outer);
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.pointerEnter(inner, { pointerType: 'mouse' });
    fireEvent.mouseOver(inner);
    fireEvent.mouseEnter(inner);
    fireEvent.mouseMove(inner);
    await act(() => vi.advanceTimersByTimeAsync(1200));
    expect(screen.getAllByRole('tooltip').map((t) => t.textContent)).toEqual(['Inner']);
  });

  it('shows the inner hint when keyboard focus reaches the control inside a nested pair', async () => {
    const user = userEvent.setup();
    render(
      <TooltipTarget text="Outer">
        <span>
          <TooltipTarget text="Inner">
            <button aria-label="Inner control">i</button>
          </TooltipTarget>
        </span>
      </TooltipTarget>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inner control' }));
    expect((await screen.findAllByRole('tooltip')).map((t) => t.textContent)).toContain('Inner');
  });

  it('does not open for the plain focus a touch tap gives its child', async () => {
    // A touch tap focuses the button without :focus-visible; the library then declines, and the mount alone shows nothing.
    vi.useFakeTimers();
    render(<Rows count={1} />);
    const button = screen.getByRole('button', { name: 'Row 0' });
    fireEvent.pointerEnter(button.parentElement as HTMLElement, { pointerType: 'touch' });
    fireEvent.pointerDown(button, { pointerType: 'touch' });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it.each([
    [
      'autoFocus',
      () => (
        <button aria-label="Auto" autoFocus>
          a
        </button>
      ),
    ],
    [
      'focus in a layout effect',
      () => {
        const Focuser = () => {
          const ref = useRef<HTMLButtonElement>(null);
          useLayoutEffect(() => ref.current?.focus(), []);
          return (
            <button aria-label="Auto" ref={ref}>
              a
            </button>
          );
        };
        return <Focuser />;
      },
    ],
    [
      'focus in an effect',
      () => {
        const Focuser = () => {
          const ref = useRef<HTMLButtonElement>(null);
          useEffect(() => ref.current?.focus(), []);
          return (
            <button aria-label="Auto" ref={ref}>
              a
            </button>
          );
        };
        return <Focuser />;
      },
    ],
  ])('shows the hint and logs no React error when the first focus comes from %s', async (_name, child) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The page was last used with the keyboard, which is what makes a focus show the hint.
    await userEvent.setup().keyboard('{Shift}');
    render(<TooltipTarget text="Autofocused">{child()}</TooltipTarget>);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Autofocused');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('draws the same wrapper before and after the library mounts, so the page does not shift', () => {
    render(
      <TooltipTarget text="Same" className="px-1" style={{ minWidth: 4 }}>
        <button aria-label="Same">s</button>
      </TooltipTarget>,
    );
    const wrapper = screen.getByRole('button', { name: 'Same' }).parentElement as HTMLElement;
    const before = wrapper.cloneNode(false) as HTMLElement;
    fireEvent.pointerEnter(wrapper, { pointerType: 'mouse' });
    const after = screen.getByRole('button', { name: 'Same' }).parentElement as HTMLElement;
    expect(after).toBe(wrapper);
    expect(after.className).toBe(before.className);
    expect(after.getAttribute('style')).toBe(before.getAttribute('style'));
    expect(after.tagName).toBe(before.tagName);
  });
});
