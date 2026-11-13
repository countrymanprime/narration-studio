// @vitest-environment jsdom
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { flushSync } from 'react-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expectHolderCleanAfterSave } from './holderContract';
import { describe, expect, it, vi } from 'vitest';
import {
  SAVE_LIMIT_MS,
  SaveTimeout,
  UnsavedDraftsProvider,
  GuardedLink,
  useGuardedAction,
  useGuardedNavigate,
  useSharedSave,
  useUnsavedDraft,
  useUnsavedDrafts,
  type SaveResult,
  type UnsavedDraft,
} from './unsavedDrafts';

/** A holder that, like a real editor, is clean once its save returned true. */
function Holder({ id, draft }: { id: string; draft: UnsavedDraft }) {
  const [saved, setSaved] = useState(false);
  useUnsavedDraft(id, {
    ...draft,
    dirty: draft.dirty && !saved,
    save: draft.save
      ? async () => {
          const done = await draft.save!();
          if (done) flushSync(() => setSaved(true));
          return done;
        }
      : undefined,
  });
  return null;
}
function Install({ shell }: { shell: { ask: (run: () => void) => void; go: (to: string, state?: unknown) => void } }) {
  const { setShell } = useUnsavedDrafts();
  useEffect(() => {
    setShell(shell);
    return () => setShell(null);
  }, [setShell, shell]);
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
    expect(result.current.heldNow()).toEqual([]);
    expect(() => render(<Holder id="alone" draft={draft()} />)).not.toThrow();
  });

  it('names a dirty holder, and not a clean one', () => {
    const { result } = setup({ a: draft({ label: 'your note' }), b: draft({ dirty: false, label: 'your entry' }) });
    expect(result.current.heldNow().map((entry) => entry.label)).toEqual(['your note']);
  });

  it('forgets a holder when it unmounts', () => {
    let registry!: ReturnType<typeof useUnsavedDrafts>;
    const Probe = () => {
      registry = useUnsavedDrafts();
      return null;
    };
    const tree = (shown: boolean) => (
      <UnsavedDraftsProvider>
        {shown && <Holder id="a" draft={draft()} />}
        <Probe />
      </UnsavedDraftsProvider>
    );
    const view = render(tree(true));
    expect(registry.heldNow().map((entry) => entry.label)).toEqual(['your note']);
    view.rerender(tree(false));
    expect(registry.heldNow()).toEqual([]);
  });

  it('a holder that says it did not save is named in failed, and the rest are still tried (#3446 B5)', async () => {
    const first = vi.fn(async () => false);
    const second = vi.fn(async () => true);
    const { result } = setup({
      a: draft({ save: first, label: 'your reply' }),
      b: draft({ save: second, label: 'your note' }),
      c: draft({ dirty: false, save: vi.fn(async () => true) }),
    });
    await act(async () => {
      const outcome = await result.current.save();
      expect(outcome.saved).toBe(false);
      expect(outcome.failed.map((entry) => entry.label)).toEqual(['your reply']);
    });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('saves them all when each saves, leaving the clean one alone', async () => {
    const clean = vi.fn(async () => true);
    const a = vi.fn(async () => true);
    const b = vi.fn(async () => true);
    const { result } = setup({ a: draft({ save: a }), b: draft({ save: b }), c: draft({ dirty: false, save: clean }) });
    await act(async () => expect(await result.current.save()).toEqual({ saved: true, failed: [], kept: [], late: [] }));
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(clean).not.toHaveBeenCalled();
  });

  it('a draft that became held while the saves ran is reported in late, never moved past (#3446 B1)', async () => {
    let release: (value: boolean) => void = () => {};
    const slow = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    const Probe = ({ late }: { late: boolean }) => <Holder id="late" draft={draft({ dirty: late, label: 'your late reply' })} />;
    const holders = (late: boolean) => (
      <UnsavedDraftsProvider>
        <Holder id="a" draft={draft({ save: slow, label: 'your note' })} />
        <Probe late={late} />
        <Registry />
      </UnsavedDraftsProvider>
    );
    let registry!: ReturnType<typeof useUnsavedDrafts>;
    const Registry = () => {
      registry = useUnsavedDrafts();
      return null;
    };
    const view = render(holders(false));
    let pending!: Promise<SaveResult>;
    act(() => {
      pending = registry.save();
    });
    view.rerender(holders(true));
    release(true);
    await act(async () => {
      const outcome = await pending;
      expect(outcome.saved).toBe(true);
      expect(outcome.late.map((entry) => entry.label)).toEqual(['your late reply']);
    });
  });

  it("a second save after the limit does not send a holder's own save again, even without useSharedSave (#3446 B9)", async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn(() => new Promise<boolean>(() => {}));
      const { result } = setup({ a: draft({ save }) });
      let stuck!: Promise<SaveResult>;
      act(() => {
        stuck = result.current.save();
      });
      const settled = expect(stuck).rejects.toBeInstanceOf(SaveTimeout);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SAVE_LIMIT_MS + 1);
      });
      await settled;
      act(() => void result.current.save().catch(() => {}));
      expect(save).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a draft that is dirty again right after its own save is reported in late (#3446 D1)', async () => {
    function Again() {
      const [text, setText] = useState('typed');
      useUnsavedDraft('again', {
        dirty: text !== '',
        label: 'your reply',
        save: async () => {
          flushSync(() => setText(''));
          queueMicrotask(() => flushSync(() => setText('typed again')));
          return true;
        },
        discard: () => setText(''),
      });
      return null;
    }
    let registry!: ReturnType<typeof useUnsavedDrafts>;
    const Registry = () => {
      registry = useUnsavedDrafts();
      return null;
    };
    render(
      <UnsavedDraftsProvider>
        <Again />
        <Registry />
      </UnsavedDraftsProvider>,
    );
    await act(async () => {
      const outcome = await registry.save();
      expect(outcome.saved).toBe(true);
      expect(outcome.late.map((entry) => entry.label)).toEqual(['your reply']);
    });
  });

  it('a draft that saved and stayed clean is not reported (the editors get a moment to render what the save cleared)', async () => {
    function Clears() {
      const [text, setText] = useState('typed');
      useUnsavedDraft('clears', {
        dirty: text !== '',
        label: 'your reply',
        save: async () => (flushSync(() => setText('')), true),
        discard: () => setText(''),
      });
      return null;
    }
    let registry!: ReturnType<typeof useUnsavedDrafts>;
    const Registry = () => {
      registry = useUnsavedDrafts();
      return null;
    };
    render(
      <UnsavedDraftsProvider>
        <Clears />
        <Registry />
      </UnsavedDraftsProvider>,
    );
    await act(async () => expectHolderCleanAfterSave(() => registry.save()));
  });

  it("a GuardedLink's onNavigate runs only when the move goes ahead: not before the question, never after Cancel (#3446 E1)", () => {
    const onNavigate = vi.fn();
    let proceed: (() => void) | undefined;
    // The shell asks first: it hands back the `after` it was given, to run only if the narrator goes on.
    const go = vi.fn((_to: string, _state?: unknown, after?: () => void) => {
      proceed = after;
    });
    const view = render(
      <MemoryRouter>
        <UnsavedDraftsProvider>
          <Install shell={{ ask: vi.fn(), go }} />
          <GuardedLink to="/proof" onNavigate={onNavigate}>
            Proof
          </GuardedLink>
        </UnsavedDraftsProvider>
      </MemoryRouter>,
    );
    fireEvent.click(view.getByRole('link', { name: 'Proof' }));
    expect(go).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
    // Cancel: the shell never runs `after`.
    expect(onNavigate).not.toHaveBeenCalled();
    // Discard or Save & continue: the shell runs it once the move goes ahead.
    proceed?.();
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('a GuardedLink with a target of _blank, or a Cmd click on a Mac, is left to the browser (#3446)', () => {
    const go = vi.fn();
    const view = render(
      <MemoryRouter>
        <UnsavedDraftsProvider>
          <Install shell={{ ask: vi.fn(), go }} />
          <GuardedLink to="/proof" target="_blank">
            Elsewhere
          </GuardedLink>
          <GuardedLink to="/pickups">Pickups</GuardedLink>
        </UnsavedDraftsProvider>
      </MemoryRouter>,
    );
    fireEvent.click(view.getByRole('link', { name: 'Elsewhere' }));
    expect(go).not.toHaveBeenCalled();
    const platform = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform');
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    try {
      fireEvent.click(view.getByRole('link', { name: 'Pickups' }), { metaKey: true });
      expect(go).not.toHaveBeenCalled();
    } finally {
      delete (navigator as unknown as Record<string, unknown>).platform;
      if (platform) Object.defineProperty(Navigator.prototype, 'platform', platform);
    }
  });

  describe('GuardedLink modifier clicks (#3446 D5)', () => {
    it.each([
      ['plain', {}, true],
      ['ctrl', { ctrlKey: true }, false],
      ['shift', { shiftKey: true }, false],
      ['alt', { altKey: true }, false],
      // Meta is a new tab only on a Mac; here (jsdom) it would load the address in this tab, so it is a plain click.
      ['meta off a Mac', { metaKey: true }, true],
      ['middle button', { button: 1 }, false],
    ] as const)('%s click: guarded move = %s', (_name, init, guarded) => {
      const go = vi.fn();
      const view = render(
        <MemoryRouter>
          <UnsavedDraftsProvider>
            <Install shell={{ ask: vi.fn(), go }} />
            <GuardedLink to="/proof">Proof</GuardedLink>
          </UnsavedDraftsProvider>
        </MemoryRouter>,
      );
      fireEvent.click(view.getByRole('link', { name: 'Proof' }), init);
      expect(go).toHaveBeenCalledTimes(guarded ? 1 : 0);
    });
  });

  it('a holder that turns clean a few milliseconds after its save resolves is not reported as held (the wait after the saves, #3446)', async () => {
    // The editor clears itself from a timer after save() resolved, as a store refresh would: read at once it would still be dirty.
    function Slowly() {
      const [text, setText] = useState('typed');
      useUnsavedDraft('slowly', {
        dirty: text !== '',
        label: 'your reply',
        save: async () => {
          setTimeout(() => flushSync(() => setText('')), 10);
          return true;
        },
        discard: () => setText(''),
      });
      return null;
    }
    let registry!: ReturnType<typeof useUnsavedDrafts>;
    const Registry = () => {
      registry = useUnsavedDrafts();
      return null;
    };
    render(
      <UnsavedDraftsProvider>
        <Slowly />
        <Registry />
      </UnsavedDraftsProvider>,
    );
    await act(async () => expect(await registry.save()).toEqual({ saved: true, failed: [], kept: [], late: [] }));
  });

  it('a draft that failed to save is named in failed only, not again in late (#3446)', async () => {
    const { result } = setup({ a: draft({ save: async () => false, label: 'your reply' }) });
    await act(async () => {
      const outcome = await result.current.save();
      expect(outcome.failed.map((entry) => entry.label)).toEqual(['your reply']);
      expect(outcome.late).toEqual([]);
    });
  });

  it('a save that resolved true but whose editor is still dirty after the wait is reported, never moved past (#3446 E2)', async () => {
    function Stubborn() {
      useUnsavedDraft('stubborn', { dirty: true, label: 'your reply', save: async () => true, discard: () => {} });
      return null;
    }
    let registry!: ReturnType<typeof useUnsavedDrafts>;
    const Registry = () => {
      registry = useUnsavedDrafts();
      return null;
    };
    render(
      <UnsavedDraftsProvider>
        <Stubborn />
        <Registry />
      </UnsavedDraftsProvider>,
    );
    await act(async () => {
      const outcome = await registry.save();
      expect(outcome.late.map((entry) => entry.label)).toEqual(['your reply']);
    });
  });

  it('discard keeps going after a holder whose discard throws, and names it (#3446 B7)', () => {
    const second = vi.fn();
    const { result } = setup({
      a: draft({
        label: 'your reply',
        discard: () => {
          throw new Error('stuck');
        },
      }),
      b: draft({ label: 'your note', discard: second }),
    });
    let outcome!: ReturnType<typeof result.current.discard>;
    act(() => {
      outcome = result.current.discard();
    });
    expect(second).toHaveBeenCalledOnce();
    expect(outcome.failed.map((entry) => entry.label)).toEqual(['your reply']);
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
    let first!: Promise<SaveResult>;
    let second!: Promise<SaveResult>;
    act(() => {
      first = result.current.save();
      second = result.current.save();
    });
    release(true);
    expect(await first).toEqual({ saved: true, failed: [], kept: [], late: [] });
    expect(await second).toEqual({ saved: true, failed: [], kept: [], late: [] });
    expect(slow).toHaveBeenCalledOnce();
  });

  it('while a draft with nothing to save is held, nothing is saved at all, and it is reported as kept and still held (#3400 D1)', async () => {
    const saved = vi.fn(async () => true);
    const row = vi.fn();
    const { result } = setup({ a: draft({ save: saved, label: 'your entry' }), b: draft({ save: undefined, label: 'a new row', discard: row }) });
    expect(result.current.heldNow().map((entry) => [entry.label, entry.saveable])).toEqual([
      ['your entry', true],
      ['a new row', false],
    ]);
    await act(async () => {
      const outcome = await result.current.save();
      expect(outcome.saved).toBe(false);
      expect(outcome.kept.map((entry) => entry.label)).toEqual(['a new row']);
    });
    // Saving the entry could close it and take the row along, so neither is saved and neither is dropped.
    expect(saved).not.toHaveBeenCalled();
    expect(row).not.toHaveBeenCalled();
    expect(result.current.heldNow().map((entry) => entry.label)).toEqual(['your entry', 'a new row']);
  });

  it('a draft that cannot be saved is dropped only by an explicit discard (#3400 D1)', () => {
    const entry = vi.fn();
    const row = vi.fn();
    const { result } = setup({ a: draft({ discard: entry }), b: draft({ save: undefined, discard: row }) });
    act(() => result.current.discard());
    expect(entry).toHaveBeenCalledOnce();
    expect(row).toHaveBeenCalledOnce();
  });

  it('a draft that cannot be saved is reported as kept even when it is the only one', async () => {
    const row = vi.fn();
    const { result } = setup({ b: draft({ save: undefined, label: 'a new row', discard: row }) });
    await act(async () => expect((await result.current.save()).kept.map((entry) => entry.label)).toEqual(['a new row']));
    expect(row).not.toHaveBeenCalled();
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
    expect(view.result.current.heldNow()).toHaveLength(2);
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
    await act(async () => expect(await result.current.save()).toEqual({ saved: true, failed: [], kept: [], late: [] }));
    expect(save).toHaveBeenCalledTimes(2);
    expect(discard).not.toHaveBeenCalled();
  });

  it('a save that never answers rejects after its limit, and a second press waits on the same request instead of sending another (#3404, #3446 B9)', async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn(() => new Promise<boolean>(() => {}));
      const { result } = setup({ a: draft({ save }) });
      let stuck!: Promise<SaveResult>;
      act(() => {
        stuck = result.current.save();
      });
      const settled = expect(stuck).rejects.toBeInstanceOf(SaveTimeout);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SAVE_LIMIT_MS + 1);
      });
      await settled;
      act(() => void result.current.save().catch(() => {}));
      expect(save).toHaveBeenCalledOnce();
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
      const [saved, setSaved] = useState(false);
      useUnsavedDraft('editor', {
        dirty: !saved,
        label: 'your text',
        save: async () => {
          const done = await save();
          if (done) flushSync(() => setSaved(true));
          return done;
        },
        discard: () => {},
      });
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
      let asked!: Promise<SaveResult>;
      act(() => {
        own = press.current();
        asked = registry.current.save();
      });
      finish(true);
      expect(await own).toBe(true);
      expect(await asked).toEqual({ saved: true, failed: [], kept: [], late: [] });
      expect(request).toHaveBeenCalledOnce();
    });

    it('a save the question stopped waiting for is not sent again by the next Save & continue', async () => {
      vi.useFakeTimers();
      try {
        let finish: (saved: boolean) => void = () => {};
        const request = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
        const { registry } = mountEditor(request);
        let first!: Promise<SaveResult>;
        act(() => {
          first = registry.current.save();
        });
        const stuck = expect(first).rejects.toBeInstanceOf(SaveTimeout);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(SAVE_LIMIT_MS + 1);
        });
        await stuck;
        let second!: Promise<SaveResult>;
        act(() => {
          second = registry.current.save();
        });
        expect(request).toHaveBeenCalledOnce();
        finish(true);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
          expect(await second).toEqual({ saved: true, failed: [], kept: [], late: [] });
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("a change inside a page, and a link out of it, take the shell's question (#3400)", () => {
    const withShell = (ui: ReactNode, shell: { ask: (run: () => void) => void; go: (to: string, state?: unknown) => void }) => {
      return (
        <MemoryRouter>
          <UnsavedDraftsProvider>
            <Install shell={shell} />
            {ui}
          </UnsavedDraftsProvider>
        </MemoryRouter>
      );
    };

    it('useGuardedAction hands the change to the shell, and runs it at once when no shell is mounted', () => {
      const run = vi.fn();
      const ask = vi.fn();
      let guarded!: ReturnType<typeof useGuardedAction>;
      const Probe = () => {
        guarded = useGuardedAction();
        return null;
      };
      const view = render(
        <UnsavedDraftsProvider>
          <Probe />
        </UnsavedDraftsProvider>,
      );
      guarded(run);
      expect(run).toHaveBeenCalledOnce();
      view.unmount();
      render(withShell(<Probe />, { ask, go: vi.fn() }));
      guarded(run);
      expect(ask).toHaveBeenCalledWith(run, undefined);
      expect(run).toHaveBeenCalledOnce();
    });

    it("useGuardedNavigate takes the shell's guarded move, with the state it was given", () => {
      const go = vi.fn();
      let navigate!: ReturnType<typeof useGuardedNavigate>;
      const Probe = () => {
        navigate = useGuardedNavigate();
        return null;
      };
      render(withShell(<Probe />, { ask: vi.fn(), go }));
      navigate('/proof', { state: { from: 'here' } });
      expect(go).toHaveBeenCalledWith('/proof', { from: 'here' }, undefined);
    });
  });

  describe('GuardedLink (#3446 B3)', () => {
    it("a plain click takes the shell's guarded move and does not navigate on its own; a modified click is left to the browser", () => {
      const go = vi.fn();
      const view = render(
        <MemoryRouter>
          <UnsavedDraftsProvider>
            <Install shell={{ ask: vi.fn(), go }} />
            <GuardedLink to="/proof">Proof</GuardedLink>
          </UnsavedDraftsProvider>
        </MemoryRouter>,
      );
      const link = view.getByRole('link', { name: 'Proof' });
      expect(link.getAttribute('href')).toBe('/proof');
      fireEvent.click(link);
      expect(go).toHaveBeenCalledWith('/proof', undefined, undefined);
      go.mockClear();
      fireEvent.click(link, { ctrlKey: true });
      expect(go).not.toHaveBeenCalled();
    });
  });
});
