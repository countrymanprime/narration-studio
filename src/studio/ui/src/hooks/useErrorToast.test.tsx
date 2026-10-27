// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../overlay/overlayService';
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
    expect(toast).toHaveBeenCalledWith('Name is taken.', { tone: 'error' });
    rerender({ message: null });
    rerender({ message: 'Name is empty.' });
    expect(toast).toHaveBeenCalledTimes(2);
  });
});
