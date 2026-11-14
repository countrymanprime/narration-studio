import { describe, expect, it, vi } from 'vitest';
import type { MouseEvent } from 'react';
import { onPlainClick } from './plainClick';

const click = (init: Partial<Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>> = {}) =>
  ({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...init }) as MouseEvent;

describe('onPlainClick', () => {
  it('runs for a plain left click', () => {
    const run = vi.fn();
    onPlainClick(run)?.(click());
    expect(run).toHaveBeenCalledOnce();
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['a non-primary button', { button: 1 }],
    ['a prevented click', { defaultPrevented: true }],
  ] as const)('does not run for %s (the link opens elsewhere, so the dialog stays)', (_name, init) => {
    const run = vi.fn();
    onPlainClick(run)?.(click(init));
    expect(run).not.toHaveBeenCalled();
  });

  it('gives no handler when there is nothing to run', () => {
    expect(onPlainClick(undefined)).toBeUndefined();
  });
});
