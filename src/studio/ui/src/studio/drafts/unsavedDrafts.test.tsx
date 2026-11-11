// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { UnsavedDraftsProvider, useUnsavedDraft, useUnsavedDrafts, type UnsavedDraft } from './unsavedDrafts';

function Holder({ id, draft }: { id: string; draft: UnsavedDraft }) {
  useUnsavedDraft(id, draft);
  return null;
}
const wrapper = ({ children }: { children: ReactNode }) => <UnsavedDraftsProvider>{children}</UnsavedDraftsProvider>;
const draft = (over: Partial<UnsavedDraft> = {}): UnsavedDraft => ({ dirty: true, label: 'your note', save: async () => true, discard: () => {}, ...over });

function setup(initial: Record<string, UnsavedDraft>) {
  const view = renderHook(() => useUnsavedDrafts(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <UnsavedDraftsProvider>
        {Object.entries(initial).map(([id, held]) => (
          <Holder key={id} id={id} draft={held} />
        ))}
        {children}
      </UnsavedDraftsProvider>
    ),
  });
  return view;
}

describe('the unsaved-drafts registry', () => {
  it('holds nothing without a holder, and a holder outside the provider is a no-op', () => {
    const { result } = renderHook(() => useUnsavedDrafts(), { wrapper });
    expect(result.current.held).toEqual([]);
    expect(() => render(<Holder id="alone" draft={draft()} />)).not.toThrow();
  });

  it('names a dirty holder, and not a clean one', () => {
    const { result } = setup({ a: draft({ label: 'your note' }), b: draft({ dirty: false, label: 'your entry' }) });
    expect(result.current.held).toEqual(['your note']);
  });

  it('forgets a holder when it unmounts', () => {
    let held: readonly string[] = [];
    const Probe = () => {
      held = useUnsavedDrafts().held;
      return null;
    };
    const tree = (shown: boolean) => (
      <UnsavedDraftsProvider>
        {shown && <Holder id="a" draft={draft()} />}
        <Probe />
      </UnsavedDraftsProvider>
    );
    const view = render(tree(true));
    expect(held).toEqual(['your note']);
    view.rerender(tree(false));
    expect(held).toEqual([]);
  });

  it('saves every dirty holder, and stops at the first that does not save', async () => {
    const first = vi.fn(async () => false);
    const second = vi.fn(async () => true);
    const { result } = setup({ a: draft({ save: first }), b: draft({ save: second }), c: draft({ dirty: false, save: vi.fn(async () => true) }) });
    await act(async () => expect(await result.current.save()).toBe(false));
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('saves them all when each saves, leaving the clean one alone', async () => {
    const clean = vi.fn(async () => true);
    const a = vi.fn(async () => true);
    const b = vi.fn(async () => true);
    const { result } = setup({ a: draft({ save: a }), b: draft({ save: b }), c: draft({ dirty: false, save: clean }) });
    await act(async () => expect(await result.current.save()).toBe(true));
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(clean).not.toHaveBeenCalled();
  });

  it('discards every dirty holder', () => {
    const a = vi.fn();
    const clean = vi.fn();
    const { result } = setup({ a: draft({ discard: a }), c: draft({ dirty: false, discard: clean }) });
    act(() => result.current.discard());
    expect(a).toHaveBeenCalledOnce();
    expect(clean).not.toHaveBeenCalled();
  });
});
