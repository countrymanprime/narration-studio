// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../overlay/overlayService';
import { toastTexts } from '../overlay/toastTesting';
import { useErrorToast } from './useErrorToast';

afterEach(() => vi.restoreAllMocks());

describe('useErrorToast', () => {
  it('toasts a message once, again for a new one, and never an empty one', () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const { rerender } = renderHook(({ message }) => useErrorToast(message), { initialProps: { message: '' as string | null } });
    expect(toast).not.toHaveBeenCalled();
    rerender({ message: 'Name is taken.' });
    rerender({ message: 'Name is taken.' });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('Name is taken.', expect.objectContaining({ tone: 'error' }));
    rerender({ message: null });
    rerender({ message: 'Name is empty.' });
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it('gives the toast a Retry that runs the latest function', () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ retry }) => useErrorToast('Could not read.', retry), { initialProps: { retry: first } });
    rerender({ retry: second });
    expect(toast).toHaveBeenCalledTimes(1);
    const options = toast.mock.calls[0]![1]!;
    expect(options.action?.label).toBe('Retry');
    options.action!.onAction();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('takes the toast away when the message clears, and replaces its own earlier message', () => {
    const { rerender } = renderHook(({ message }) => useErrorToast(message), { initialProps: { message: 'Gone quiet.' as string | null } });
    expect(toastTexts()).toEqual(['Gone quiet.']);
    rerender({ message: 'Still quiet.' });
    expect(toastTexts()).toEqual(['Still quiet.']);
    rerender({ message: null });
    expect(toastTexts()).toEqual([]);
  });
});
