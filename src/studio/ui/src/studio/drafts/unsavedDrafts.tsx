import { createContext, type AnchorHTMLAttributes, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useHref, useNavigate, type NavigateOptions } from 'react-router-dom';
import type { DraftLabel, HeldDraft } from './draftSentence';

// The registry of drafts: text a page holds that is not saved yet and that leaving the page, or switching what the editor shows, would drop (#3400). A
// holder joins with `useUnsavedDraft`; the app shell asks `useUnsavedDrafts` whether anything is held before every exit (the nav, Back and Forward, the
// jump menu, Switch project) and puts one question to the narrator ("Save & continue", "Discard & continue", "Cancel"). A move inside a page that
// would unmount or replace a holder (another Settings category, another entry, Close on the credits editor) goes through `useGuardedAction`, and a
// link that leaves the page through `useGuardedNavigate`, so both ask the same question. Settings' own fields keep their separate registry
// (`SettingsFormsProvider`), because they save as a form; this one is for every other editor with a Save of its own.

/** How long the registry waits after the saves for the editors to render what they cleared, before it reads what is still held. */
const SETTLE_AFTER_SAVE_MS = 30;

/** How long a save may take before the question stops waiting for it: the narrator gets the buttons back, and the text stays where it was typed. */
export const SAVE_LIMIT_MS = 15_000;

/** A save that did not answer within `SAVE_LIMIT_MS`. The request may still be running: it is not stopped, only no longer waited for. */
export class SaveTimeout extends Error {
  constructor() {
    super('The save did not finish.');
  }
}

/**
 * One save at a time for an editor: a second call while the first is in flight gets the first's answer and sends nothing. The editor uses the returned
 * function for its own Save button and as its draft's `save`, so the question's Save & continue waits for a save the narrator already pressed, and a save
 * the question stopped waiting for (the limit) is not sent again (#3404).
 */
export function useSharedSave(save: () => Promise<boolean>): () => Promise<boolean> {
  const latest = useRef(save);
  latest.current = save;
  const inflight = useRef<Promise<boolean> | null>(null);
  return useCallback(() => {
    if (inflight.current) return inflight.current;
    const run = latest.current().finally(() => {
      inflight.current = null;
    });
    inflight.current = run;
    return run;
  }, []);
}

/** Gives `work` `SAVE_LIMIT_MS` to finish: a save that never answers rejects, so the question can give the narrator their buttons back. */
export function withinSaveLimit<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SaveTimeout()), SAVE_LIMIT_MS);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** What a holder tells the shell. */
export type UnsavedDraft = DraftLabel & {
  /** Whether the editor holds text that differs from what is saved. */
  dirty: boolean;
  /**
   * Saves the draft; resolves true when it is saved (the editor says why in its own words when it is not, and the narrator stays). Absent for a draft that
   * cannot be saved from here (a new Story Bible entry needs a category chosen first): the question then offers only to keep editing or discard.
   *
   * Contract: resolve true only once the editor renders clean. The registry reads the editor `SETTLE_AFTER_SAVE_MS` after the saves and treats anything still
   * dirty as held again, so an editor that turns clean later (a store refresh after the save resolved) would stop every Save & continue with "changed while
   * saving". Each screen proves its holder meets it.
   */
  save?: () => Promise<boolean>;
  /** Drops the draft. The page is about to go, so this only has to settle what must not outlive it. */
  discard: () => void;
};

type Registry = {
  /** What is held right now, read from the editors themselves and not from the last render: an edit committed a moment ago (a box that saves on blur) counts. */
  heldNow: () => readonly HeldDraft[];
  join: (id: string, draft: () => UnsavedDraft) => void;
  leave: (id: string) => void;
  /**
   * Saves every held draft that can be saved; one call in flight at a time, so a second press shares the first's answer, and a draft whose own save is still
   * in flight (one the question stopped waiting for) is not sent again. A draft that says it did not save is named in `failed` and the rest are still tried;
   * one that throws, or a call that takes longer than `SAVE_LIMIT_MS`, rejects. Either way the text stays, and the next call starts afresh.
   * Nothing is dropped here (#3400: only a Discard drops text): while a draft with nothing to save is held nothing is saved at all, and it comes back in
   * `kept`; a draft that became held while the saves ran comes back in `late`; the shell stays where it is.
   */
  save: () => Promise<SaveResult>;
  /** Drops every held draft; one that throws is named in `failed` and the rest are still dropped. */
  discard: () => DiscardResult;
  /** The shell sets these: `ask` runs `run` now, or after the question when something is held; `go` is the shell's guarded move. */
  setShell: (shell: Shell | null) => void;
  ask: (run: () => void, options?: AskOptions) => void;
  go: (to: string, state?: unknown, after?: () => void) => boolean;
  /** Changes whenever what is held may have changed; the shell reads it only to re-render. */
  version: number;
};
/**
 * What `save` found. `saved`: every draft that can be saved did save. `failed`: those that said they did not. `kept`: the held drafts that cannot be saved from
 * here. `late`: anything else still held after the saves. All of `failed`, `kept` and `late` are still held, so the shell stays.
 */
export type SaveResult = { saved: boolean; failed: readonly HeldDraft[]; kept: readonly HeldDraft[]; late: readonly HeldDraft[] };
/** What `discard` found: the drafts whose discard threw, which are still held. */
export type DiscardResult = { failed: readonly HeldDraft[] };
/** `settle: false` keeps the focus where it is: the change is made from the box the narrator is typing in (the Settings search), which an exit would take it from. */
export type AskOptions = { settle?: boolean };
type Shell = {
  ask: (run: () => void, options?: AskOptions) => void;
  go: (to: string, state?: unknown, after?: () => void) => void;
  /** A save the question stopped waiting for (the limit) has now failed: the narrator is told, since nothing else will say so. */
  lateFailure?: (outcome: { error: unknown } | { failed: readonly HeldDraft[] }) => void;
};

const toHeld = ({ label, brief, kind, many, save }: UnsavedDraft): HeldDraft => ({ label, brief, kind, many, saveable: save !== undefined });

const DraftsContext = createContext<Registry | undefined>(undefined);

/** Mounted once, above the routes. */
export function UnsavedDraftsProvider({ children }: { children: ReactNode }) {
  // Each entry reads the editor's latest props (see `useUnsavedDraft`), so `dirty` is as of its last render and not of the last effect.
  const drafts = useRef(new Map<string, () => UnsavedDraft>());
  const shell = useRef<Shell | null>(null);
  const saving = useRef<Promise<SaveResult> | null>(null);
  // Bumped on every join and leave (an editor's `dirty` changing is a join), so the shell re-renders when what is held changes and a question open over it can notice.
  const [version, setVersion] = useState(0);
  const heldNow = useCallback(
    (): HeldDraft[] =>
      [...drafts.current.values()]
        .map((read) => read())
        .filter((draft) => draft.dirty)
        .map(toHeld),
    [],
  );
  const dirtyNow = useCallback(() => [...drafts.current.values()].map((read) => read()).filter((draft) => draft.dirty), []);
  const join = useCallback((id: string, draft: () => UnsavedDraft) => {
    drafts.current.set(id, draft);
    setVersion((current) => current + 1);
  }, []);
  const leave = useCallback((id: string) => {
    drafts.current.delete(id);
    setVersion((current) => current + 1);
  }, []);
  // A save the question stopped waiting for (the limit) is still running: the next press shares it, for a holder that does not share its own save too.
  const inflight = useRef(new Map<string, Promise<boolean>>());
  const save = useCallback(() => {
    if (saving.current) return saving.current;
    const saved = (async (): Promise<SaveResult> => {
      const entries = [...drafts.current].map(([id, read]) => [id, read()] as const).filter(([, draft]) => draft.dirty);
      // A draft with no save of its own (a new entry with no category) is not saved here, and not dropped either: it stays held and the shell stays put.
      const kept = entries.filter(([, draft]) => !draft.save).map(([, draft]) => toHeld(draft));
      // All or nothing: saving an editor can close it and a draft beside it that cannot be saved with it, so while one is held nothing is saved.
      if (kept.length > 0) return { saved: false, failed: [], kept, late: [] };
      const failed: HeldDraft[] = [];
      const failedIds = new Set<string>();
      let tried = 0;
      for (const [id, draft] of entries) {
        if (!draft.save) continue;
        // A long run of instant saves, each clearing its editor, would nest React's updates past its limit; a macrotask now and then lets them settle.
        if (tried > 0 && tried % 25 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
        tried += 1;
        let request = inflight.current.get(id);
        if (!request) {
          request = draft.save().finally(() => inflight.current.delete(id));
          inflight.current.set(id, request);
        }
        if (!(await request)) {
          failed.push(toHeld(draft));
          failedIds.add(id);
        }
      }
      // What is held now that is not a save that failed was never asked about: a draft that became held while the saves ran (a late reply, a restored draft), and
      // one that was dirty again right after its own save. The editors need a moment to render what the saves cleared before they can be read.
      await new Promise<void>((resolve) => setTimeout(resolve, SETTLE_AFTER_SAVE_MS));
      const late = [...drafts.current]
        .filter(([id]) => !failedIds.has(id))
        .map(([, read]) => read())
        .filter((draft) => draft.dirty)
        .map(toHeld);
      return { saved: failed.length === 0, failed, kept, late };
    })();
    let gaveUp = false;
    const run = withinSaveLimit(saved).finally(() => {
      saving.current = null;
    });
    // The question stopped waiting at the limit, so a save that fails after it has nobody to tell: the shell says so (#3446).
    run.catch((error: unknown) => {
      if (error instanceof SaveTimeout) gaveUp = true;
    });
    saved.then(
      (result) => {
        if (gaveUp && result.failed.length > 0) shell.current?.lateFailure?.({ failed: result.failed });
      },
      (error: unknown) => {
        if (gaveUp) shell.current?.lateFailure?.({ error });
      },
    );
    saving.current = run;
    return run;
  }, []);
  const discard = useCallback((): DiscardResult => {
    const failed: HeldDraft[] = [];
    for (const draft of dirtyNow()) {
      try {
        draft.discard();
      } catch {
        failed.push(toHeld(draft));
      }
    }
    return { failed };
  }, [dirtyNow]);
  const setShell = useCallback((next: Shell | null) => {
    shell.current = next;
  }, []);
  const ask = useCallback((run: () => void, options?: AskOptions) => (shell.current ? shell.current.ask(run, options) : run()), []);
  const go = useCallback((to: string, state?: unknown, after?: () => void) => {
    if (!shell.current) return false;
    shell.current.go(to, state, after);
    return true;
  }, []);
  const value = useMemo(
    () => ({ heldNow, join, leave, save, discard, setShell, ask, go, version }),
    [version, heldNow, join, leave, save, discard, setShell, ask, go],
  );
  return <DraftsContext.Provider value={value}>{children}</DraftsContext.Provider>;
}

/**
 * Joins the registry while mounted. A holder rendered outside the provider (a unit test of one editor) holds nothing from the shell's side.
 * The latest `draft` is always the one the shell saves or discards, so the editor does not memoize its handlers.
 */
export function useUnsavedDraft(id: string, draft: UnsavedDraft): void {
  const registry = useContext(DraftsContext);
  const latest = useRef(draft);
  latest.current = draft;
  const join = registry?.join;
  const leave = registry?.leave;
  const { dirty, label, brief, kind } = draft;
  const saveable = draft.save !== undefined;
  // Two editors of one kind may be mounted at once (two findings' note boxes), so the registry's key is the editor's own as well as its name.
  const own = useId();
  const key = `${id}:${own}`;
  useEffect(() => {
    if (!join) return;
    join(key, () => ({
      ...latest.current,
      save: latest.current.save ? () => latest.current.save?.() ?? Promise.resolve(false) : undefined,
      discard: () => latest.current.discard(),
    }));
    // `many` is a function the editor makes anew on every render: it is read through `latest`, and is not a reason to join again.
  }, [join, key, dirty, label, brief, kind, saveable]);
  useEffect(() => {
    if (!leave) return;
    return () => leave(key);
  }, [leave, key]);
}

/** For the app shell: what is held now, the one Save and the one Discard that reach every holder, and the hooks it plugs its guarded moves into. */
export function useUnsavedDrafts(): Pick<Registry, 'heldNow' | 'save' | 'discard' | 'setShell'> {
  const registry = useContext(DraftsContext);
  return useMemo(
    () =>
      registry ?? {
        heldNow: () => [],
        save: async () => ({ saved: true, failed: [], kept: [], late: [] }),
        discard: () => ({ failed: [] }),
        setShell: () => {},
      },
    [registry],
  );
}

/** Wraps a change inside a page that would drop an editor's draft (another category, another entry, Close): `run` goes ahead at once, or after the question. */
export function useGuardedAction(): (run: () => void, options?: AskOptions) => void {
  return useContext(DraftsContext)?.ask ?? ((run) => run());
}

/** The router's `navigate` for a link that leaves the page: it takes the shell's guarded move, so the unsaved question and the Booth's leave question apply. */
export function useGuardedNavigate(): (to: string, options?: NavigateOptions & { after?: () => void }) => void {
  const go = useContext(DraftsContext)?.go;
  const navigate = useNavigate();
  return useCallback(
    (to, options) => {
      if (go?.(to, options?.state, options?.after)) return;
      navigate(to, options);
      options?.after?.();
    },
    [go, navigate],
  );
}

/**
 * The router's `Link` for a link that leaves the page: a real anchor (so the address shows, and a middle click or Ctrl+click opens it as usual), whose plain
 * click takes the shell's guarded move. `onNavigate` is the caller's side effect of the move (closing a panel): it runs only when the move goes ahead. A router `Link` navigates on its own and skips the question (#3446 B3).
 */
export function GuardedLink({
  to,
  onClick,
  onNavigate,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; onNavigate?: () => void }) {
  const href = useHref(to);
  const go = useGuardedNavigate();
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || rest.target === '_blank') return;
        // The browser opens a new tab or window for Ctrl, Shift and, on a Mac, Cmd: the page and its drafts stay where they are. Alt downloads. Any other modified
        // click (Meta off a Mac) would load the address in this tab and drop what is typed with no question, so it is a plain click.
        if (event.ctrlKey || event.shiftKey || event.altKey || (event.metaKey && isMac())) return;
        event.preventDefault();
        go(to, { after: onNavigate });
      }}
    >
      {children}
    </a>
  );
}

const isMac = (): boolean => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
