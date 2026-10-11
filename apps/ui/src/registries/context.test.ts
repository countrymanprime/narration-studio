// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextItemsFor, registerContextProvider, useContextProvider, type ContextProvider } from './context';

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
});

const provider = (match: boolean, key: string): ContextProvider & { items: ReturnType<typeof vi.fn> } => ({
  match: vi.fn(() => match),
  items: vi.fn(() => [{ key, label: key, onSelect: () => {} }]),
});
const register = (p: ContextProvider) => cleanups.push(registerContextProvider(p));
const target = () => document.createElement('p');

describe('contextItemsFor', () => {
  it('first-matching-provider-wins: asks only that provider for items, and answers null when none match', () => {
    const skipped = provider(false, 'skipped');
    const first = provider(true, 'first');
    const second = provider(true, 'second');
    register(skipped);
    register(first);
    register(second);
    const el = target();
    expect(contextItemsFor(el)?.map((item) => item.key)).toEqual(['first']);
    expect(first.items).toHaveBeenCalledWith(el);
    expect(skipped.items).not.toHaveBeenCalled();
    expect(second.match).not.toHaveBeenCalled();
    expect(second.items).not.toHaveBeenCalled();
    cleanups.forEach((fn) => fn());
    cleanups = [];
    register(provider(false, 'none'));
    expect(contextItemsFor(el)).toBeNull();
  });

  it('calls items at open time, never at registration', () => {
    const p = provider(true, 'late');
    register(p);
    expect(p.items).not.toHaveBeenCalled();
    contextItemsFor(target());
    expect(p.items).toHaveBeenCalledOnce();
  });

  it('unregister-removes-and-order-is-registration-order: each unregister removes only its own entry', () => {
    const a = provider(true, 'a');
    const b = provider(true, 'b');
    const offA = registerContextProvider(a);
    const offA2 = registerContextProvider(a);
    cleanups.push(offA, offA2, registerContextProvider(b));
    offA();
    // The provider registered twice is two entries: one is left, and it still comes before b.
    expect(contextItemsFor(target())?.map((item) => item.key)).toEqual(['a']);
    offA2();
    expect(contextItemsFor(target())?.map((item) => item.key)).toEqual(['b']);
  });
});

describe('useContextProvider', () => {
  it('registers while mounted and removes the provider on unmount', () => {
    const p = provider(true, 'hooked');
    const { unmount } = renderHook(() => useContextProvider(p));
    expect(contextItemsFor(target())?.map((item) => item.key)).toEqual(['hooked']);
    unmount();
    expect(contextItemsFor(target())).toBeNull();
  });
});
