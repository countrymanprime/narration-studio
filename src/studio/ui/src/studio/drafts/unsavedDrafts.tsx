import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, type NavigateOptions } from 'react-router-dom';
import type { DraftLabel } from './draftSentence';

// The registry of drafts: text a page holds that is not saved yet and that leaving the page, or switching what the editor shows, would drop (#3400). A
// holder joins with `useUnsavedDraft`; the app shell asks `useUnsavedDrafts` whether anything is held before every exit (the nav, Back and Forward, the
// jump menu, Switch project) and puts one question to the narrator ("Save & continue", "Discard & continue", "Cancel"). A move inside a page that
// would unmount or replace a holder (another Settings category, another entry, Close on the credits editor) goes through `useGuardedAction`, and a
// link that leaves the page through `useGuardedNavigate`, so both ask the same question. Settings' own fields keep their separate registry
// (`SettingsFormsProvider`), because they save as a form; this one is for every other editor with a Save of its own.

/** What a holder tells the shell. */
export type UnsavedDraft = DraftLabel & {
  /** Whether the editor holds text that differs from what is saved. */
  dirty: boolean;
  /**
   * Saves the draft; resolves true when it is saved (the editor says why in its own words when it is not, and the narrator stays). Absent for a draft that
   * cannot be saved from here (a new Story Bible entry needs a category chosen first): the question then offers only to keep editing or discard.
   */
  save?: () => Promise<boolean>;
  /** Drops the draft. The page is about to go, so this only has to settle what must not outlive it. */
  discard: () => void;
};

type Registry = {
  /** The held drafts' labels, in the order they were first held. */
  held: readonly DraftLabel[];
  /** True when every held draft can be saved from the question. */
  canSave: boolean;
  join: (id: string, draft: UnsavedDraft) => void;
  leave: (id: string) => void;
  /** Saves every held draft; one call in flight at a time, so a second press shares the first's answer. */
  save: () => Promise<boolean>;
  discard: () => void;
  /** The shell sets these: `ask` runs `run` now, or after the question when something is held; `go` is the shell's guarded move. */
  setShell: (shell: Shell | null) => void;
  ask: (run: () => void) => void;
  go: (to: string, state?: unknown) => boolean;
};
type Shell = { ask: (run: () => void) => void; go: (to: string, state?: unknown) => void };

const DraftsContext = createContext<Registry | undefined>(undefined);

/** Mounted once, above the routes. */
export function UnsavedDraftsProvider({ children }: { children: ReactNode }) {
  const drafts = useRef(new Map<string, UnsavedDraft>());
  const shell = useRef<Shell | null>(null);
  const saving = useRef<Promise<boolean> | null>(null);
  const [held, setHeld] = useState<{ labels: readonly DraftLabel[]; canSave: boolean }>({ labels: [], canSave: true });
  const publish = useCallback(() => {
    const dirty = [...drafts.current.values()].filter((draft) => draft.dirty);
    const labels = dirty.map(({ label, many }) => ({ label, many }));
    const canSave = dirty.every((draft) => draft.save);
    setHeld((current) =>
      current.canSave === canSave && current.labels.length === labels.length && current.labels.every((entry, index) => entry.label === labels[index]!.label)
        ? current
        : { labels, canSave },
    );
  }, []);
  const join = useCallback(
    (id: string, draft: UnsavedDraft) => {
      drafts.current.set(id, draft);
      publish();
    },
    [publish],
  );
  const leave = useCallback(
    (id: string) => {
      drafts.current.delete(id);
      publish();
    },
    [publish],
  );
  const save = useCallback(() => {
    if (saving.current) return saving.current;
    const run = (async () => {
      for (const draft of [...drafts.current.values()].filter((entry) => entry.dirty)) if (!(await draft.save?.())) return false;
      return true;
    })().finally(() => {
      saving.current = null;
    });
    saving.current = run;
    return run;
  }, []);
  const discard = useCallback(() => {
    for (const draft of [...drafts.current.values()].filter((entry) => entry.dirty)) draft.discard();
  }, []);
  const setShell = useCallback((next: Shell | null) => {
    shell.current = next;
  }, []);
  const ask = useCallback((run: () => void) => (shell.current ? shell.current.ask(run) : run()), []);
  const go = useCallback((to: string, state?: unknown) => {
    if (!shell.current) return false;
    shell.current.go(to, state);
    return true;
  }, []);
  const value = useMemo(
    () => ({ held: held.labels, canSave: held.canSave, join, leave, save, discard, setShell, ask, go }),
    [held, join, leave, save, discard, setShell, ask, go],
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
  const { dirty, label, many } = draft;
  const saveable = draft.save !== undefined;
  useEffect(() => {
    if (!join) return;
    join(id, {
      dirty,
      label,
      many,
      save: saveable ? () => latest.current.save?.() ?? Promise.resolve(false) : undefined,
      discard: () => latest.current.discard(),
    });
  }, [join, id, dirty, label, many, saveable]);
  useEffect(() => {
    if (!leave) return;
    return () => leave(id);
  }, [leave, id]);
}

/** For the app shell: what is held now, the one Save and the one Discard that reach every holder, and the hooks it plugs its guarded moves into. */
export function useUnsavedDrafts(): Pick<Registry, 'held' | 'canSave' | 'save' | 'discard' | 'setShell'> {
  const registry = useContext(DraftsContext);
  return useMemo(() => registry ?? { held: [], canSave: true, save: async () => true, discard: () => {}, setShell: () => {} }, [registry]);
}

/** Wraps a change inside a page that would drop an editor's draft (another category, another entry, Close): `run` goes ahead at once, or after the question. */
export function useGuardedAction(): (run: () => void) => void {
  return useContext(DraftsContext)?.ask ?? ((run) => run());
}

/** The router's `navigate` for a link that leaves the page: it takes the shell's guarded move, so the unsaved question and the Booth's leave question apply. */
export function useGuardedNavigate(): (to: string, options?: NavigateOptions) => void {
  const go = useContext(DraftsContext)?.go;
  const navigate = useNavigate();
  return useCallback((to, options) => (go?.(to, options?.state) ? undefined : navigate(to, options)), [go, navigate]);
}
