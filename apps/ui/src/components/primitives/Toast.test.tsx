// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_INFO_MS, ToastRegion, type ToastMessage } from './Toast';
import { guardedMotion, unguardedMotion } from '../../motionScan';

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

  it('never dismisses an error by itself, however long it stays', () => {
    const dismiss = vi.fn();
    render(<ToastRegion messages={[failure(3)]} dismiss={dismiss} />);
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS * 20));
    expect(dismiss).not.toHaveBeenCalled();
    expect(screen.getByText('Failure 3')).toBeTruthy();
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
});

describe('ToastRegion under reduced motion', () => {
  it('fades and shifts a leaving toast only through `motion-ok:` classes, and has no stray `ease` class', () => {
    render(<ToastRegion messages={[info(1)]} dismiss={vi.fn()} />);
    expect(unguardedMotion(document.body.innerHTML)).toEqual([]);
    expect(guardedMotion(document.body.innerHTML)).toContain('motion-ok:transition-[opacity,transform]');
    expect(screen.getByText('Message 1').closest('[data-tone]')!.classList.contains('ease')).toBe(false);
  });
});
