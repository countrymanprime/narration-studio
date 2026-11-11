// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SAVE_LIMIT_MS, SaveTimeout, UnsavedDraftsProvider, useSharedSave, useUnsavedDraft, useUnsavedDrafts, type UnsavedDraft } from './unsavedDrafts';

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
    expect(result.current.held.map((entry) => entry.label)).toEqual(['your note']);
  });

  it('forgets a holder when it unmounts', () => {
    let held: readonly string[] = [];
    const Probe = () => {
      held = useUnsavedDrafts().held.map((entry) => entry.label);
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

  it('a second save while the first runs shares it and saves once (#3400)', async () => {
    let release: (value: boolean) => void = () => {};
    const slow = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    const { result } = setup({ a: draft({ save: slow }) });
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.save();
      second = result.current.save();
    });
    release(true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(slow).toHaveBeenCalledOnce();
  });

  it('says which held drafts have nothing to save, and leaves them out of the one Save', async () => {
    const saved = vi.fn(async () => true);
    const { result } = setup({ a: draft({ save: saved, label: 'your entry' }), b: draft({ save: undefined, label: 'a new row' }) });
    expect(result.current.held.map((entry) => [entry.label, entry.saveable])).toEqual([
      ['your entry', true],
      ['a new row', false],
    ]);
    await act(async () => expect(await result.current.save()).toBe(true));
    expect(saved).toHaveBeenCalledOnce();
  });

  it('discards only the drafts with nothing to save after the rest is saved', () => {
    const entry = vi.fn();
    const row = vi.fn();
    const { result } = setup({ a: draft({ discard: entry }), b: draft({ save: undefined, discard: row }) });
    act(() => result.current.discardUnsaveable());
    expect(row).toHaveBeenCalledOnce();
    expect(entry).not.toHaveBeenCalled();
  });

  it('two editors that register under one name both hold their text (the Proof note box of two findings, #3404)', () => {
    const discards = [vi.fn(), vi.fn()];
    const view = renderHook(() => useUnsavedDrafts(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <UnsavedDraftsProvider>
          <Holder id="finding-note-reply" draft={draft({ label: 'the note you are writing', discard: discards[0] })} />
          <Holder id="finding-note-reply" draft={draft({ label: 'the note you are writing', discard: discards[1] })} />
          {children}
        </UnsavedDraftsProvider>
      ),
    });
    expect(view.result.current.held).toHaveLength(2);
    act(() => view.result.current.discard());
    expect(discards[0]).toHaveBeenCalledOnce();
    expect(discards[1]).toHaveBeenCalledOnce();
  });

  it('a save that throws rejects, and the next save starts afresh with the text untouched (#3404)', async () => {
    const discard = vi.fn();
    const save = vi.fn().mockRejectedValueOnce(new Error('the host went away')).mockResolvedValue(true);
    const { result } = setup({ a: draft({ save, discard }) });
    await act(async () => {
      await expect(result.current.save()).rejects.toThrow('the host went away');
    });
    await act(async () => expect(await result.current.save()).toBe(true));
    expect(save).toHaveBeenCalledTimes(2);
    expect(discard).not.toHaveBeenCalled();
  });

  it('a save that never answers rejects after its limit, and a second press then starts a new save (#3404)', async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn(() => new Promise<boolean>(() => {}));
      const { result } = setup({ a: draft({ save }) });
      let stuck!: Promise<boolean>;
      act(() => {
        stuck = result.current.save();
      });
      const settled = expect(stuck).rejects.toBeInstanceOf(SaveTimeout);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SAVE_LIMIT_MS + 1);
      });
      await settled;
      act(() => void result.current.save().catch(() => {}));
      expect(save).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('heldNow reads what the editors rendered, before any effect has reported it (a box that saved on blur a moment ago, #3404)', () => {
    let seenInRender: readonly string[] = [];
    const Probe = () => {
      seenInRender = useUnsavedDrafts()
        .heldNow()
        .map((entry) => entry.label);
      return null;
    };
    const tree = (dirty: boolean) => (
      <UnsavedDraftsProvider>
        <Holder id="a" draft={draft({ dirty, label: 'your row' })} />
        <Probe />
      </UnsavedDraftsProvider>
    );
    const view = render(tree(false));
    expect(seenInRender).toEqual([]);
    // The probe renders after the holder in the same pass, before the holder's effect runs.
    view.rerender(tree(true));
    expect(seenInRender).toEqual(['your row']);
  });

  describe('an editor whose own Save and the question share one request (#3404)', () => {
    /** An editor with its own Save button (`press`) over a slow request; the registry's save reaches the same function. */
    function Editor({ request, press }: { request: () => Promise<boolean>; press: { current: () => Promise<boolean> } }) {
      const save = useSharedSave(request);
      press.current = save;
      useUnsavedDraft('editor', { dirty: true, label: 'your text', save, discard: () => {} });
      return null;
    }
    const mountEditor = (request: () => Promise<boolean>) => {
      const press = { current: (() => Promise.resolve(false)) as () => Promise<boolean> };
      const view = renderHook(() => useUnsavedDrafts(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <UnsavedDraftsProvider>
            <Editor request={request} press={press} />
            {children}
          </UnsavedDraftsProvider>
        ),
      });
      return { press, registry: view.result };
    };

    it('the question waits for a save the narrator already pressed and sends nothing more', async () => {
      let finish: (saved: boolean) => void = () => {};
      const request = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
      const { press, registry } = mountEditor(request);
      let own!: Promise<boolean>;
      let asked!: Promise<boolean>;
      act(() => {
        own = press.current();
        asked = registry.current.save();
      });
      finish(true);
      expect(await own).toBe(true);
      expect(await asked).toBe(true);
      expect(request).toHaveBeenCalledOnce();
    });

    it('a save the question stopped waiting for is not sent again by the next Save & continue', async () => {
      vi.useFakeTimers();
      try {
        let finish: (saved: boolean) => void = () => {};
        const request = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
        const { registry } = mountEditor(request);
        let first!: Promise<boolean>;
        act(() => {
          first = registry.current.save();
        });
        const stuck = expect(first).rejects.toBeInstanceOf(SaveTimeout);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(SAVE_LIMIT_MS + 1);
        });
        await stuck;
        let second!: Promise<boolean>;
        act(() => {
          second = registry.current.save();
        });
        expect(request).toHaveBeenCalledOnce();
        finish(true);
        await act(async () => expect(await second).toBe(true));
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
