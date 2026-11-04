// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createOverlayService } from '../overlay/overlayService';
import { useToasts } from './useToasts';

const setup = () => {
  const service = createOverlayService();
  const hook = renderHook(() => useToasts(service));
  return { service, ...hook };
};
const shown = (service: ReturnType<typeof createOverlayService>) => service.getSnapshot().toasts;

describe('useToasts', () => {
  it('notifies with the information tone by default and ignores an empty text', () => {
    const { service, result } = setup();
    act(() => result.current.notify('Saved.'));
    act(() => result.current.notify(''));
    act(() => result.current.notify('Could not save.', 'error'));
    expect(shown(service).map((m) => [m.text, m.tone])).toEqual([
      ['Saved.', 'info'],
      ['Could not save.', 'error'],
    ]);
  });

  it('carries a longer stay, an action and an icon through to the message', () => {
    const { service, result } = setup();
    const onAction = () => {};
    act(() => result.current.notify('Kept.', 'info', { label: 'Undo', onAction }, undefined, 12_000));
    expect(shown(service)[0]).toMatchObject({ durationMs: 12_000, action: { label: 'Undo', onAction } });
  });

  it('keeps notify the same function across renders, so an effect that lists it does not re-run', () => {
    const { result, rerender } = setup();
    const { notify } = result.current;
    rerender();
    expect(result.current.notify).toBe(notify);
  });
});
