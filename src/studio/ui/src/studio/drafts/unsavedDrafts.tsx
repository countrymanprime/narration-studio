import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, type NavigateOptions } from 'react-router-dom';
import type { DraftLabel, HeldDraft } from './draftSentence';

// The registry of drafts: text a page holds that is not saved yet and that leaving the page, or switching what the editor shows, would drop (#3400). A
// holder joins with `useUnsavedDraft`; the app shell asks `useUnsavedDrafts` whether anything is held before every exit (the nav, Back and Forward, the
// jump menu, Switch project) and puts one question to the narrator ("Save & continue", "Discard & continue", "Cancel"). A move inside a page that
// would unmount or replace a holder (another Settings category, another entry, Close on the credits editor) goes through `useGuardedAction`, and a
// link that leaves the page through `useGuardedNavigate`, so both ask the same question. Settings' own fields keep their separate registry
// (`SettingsFormsProvider`), because they save as a form; this one is for every other editor with a Save of its own.

/** How long a save may take before the question stops waiting for it: the narrator gets the buttons back, and the text stays where it was typed. */
export const SAVE_LIMIT_MS = 15_000;

/** Gives `work` `SAVE_LIMIT_MS` to finish: a save that never answers rejects, so the question can give the narrator their buttons back. */
export function withinSaveLimit<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The save did not finish.')), SAVE_LIMIT_MS);
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
   */
  save?: () => Promise<boolean>;
  /** Drops the draft. The page is about to go, so this only has to settle what must not outlive it. */
  discard: () => void;
};

type Registry = {
  /** The held drafts, in the order they were first held, each with whether the question can save it. */
  held: readonly HeldDraft[];
  join: (id: string, draft: UnsavedDraft) => void;
  leave: (id: string) => void;
  /**
   * Saves every held draft that can be saved; one call in flight at a time, so a second press shares the first's answer. A draft that says it did not save
   * ends it with false; one that throws, or takes longer than `SAVE_LIMIT_MS`, rejects. Either way the text stays, and the next call starts afresh.
   */
  save: () => Promise<boolean>;
  discard: () => void;
  /** Drops the held drafts that have no save (the question said they go when the rest is saved). */
  discardUnsaveable: () => void;
  /** The shell sets these: `ask` runs `run` now, or after the question when something is held; `go` is the shell's guarded move. */
  setShell: (shell: Shell | null) => void;
  ask: (run: () => void, options?: AskOptions) => void;
  go: (to: string, state?: unknown) => boolean;
};
/** `settle: false` keeps the focus where it is: the change is made from the box the narrator is typing in (the Settings search), which an exit would take it from. */
export type AskOptions = { settle?: boolean };
type Shell = { ask: (run: () => void, options?: AskOptions) => void; go: (to: string, state?: unknown) => void };

const DraftsContext = createContext<Registry | undefined>(undefined);

/** Mounted once, above the routes. */
export function UnsavedDraftsProvider({ children }: { children: ReactNode }) {
  const drafts = useRef(new Map<string, UnsavedDraft>());
  const shell = useRef<Shell | null>(null);
  const saving = useRef<Promise<boolean> | null>(null);
  const [held, setHeld] = useState<readonly HeldDraft[]>([]);
  const publish = useCallback(() => {
    const labels = [...drafts.current.values()]
      .filter((draft) => draft.dirty)
      .map(({ label, brief, kind, many, save }): HeldDraft => ({ label, brief, kind, many, saveable: save !== undefined }));
    setHeld((current) =>
      current.length === labels.length && current.every((entry, index) => entry.label === labels[index]!.label && entry.saveable === labels[index]!.saveable)
        ? current
        : labels,
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
    const saved = (async () => {
      // A draft with no save of its own (a new entry with no category) is not saved here; the question says it goes.
      for (const draft of [...drafts.current.values()].filter((entry) => entry.dirty && entry.save)) if (!(await draft.save!())) return false;
      return true;
    })();
    const run = withinSaveLimit(saved).finally(() => {
      saving.current = null;
    });
    saving.current = run;
    return run;
  }, []);
  const discard = useCallback(() => {
    for (const draft of [...drafts.current.values()].filter((entry) => entry.dirty)) draft.discard();
  }, []);
  const discardUnsaveable = useCallback(() => {
    for (const draft of [...drafts.current.values()].filter((entry) => entry.dirty && !entry.save)) draft.discard();
  }, []);
  const setShell = useCallback((next: Shell | null) => {
    shell.current = next;
  }, []);
  const ask = useCallback((run: () => void, options?: AskOptions) => (shell.current ? shell.current.ask(run, options) : run()), []);
  const go = useCallback((to: string, state?: unknown) => {
    if (!shell.current) return false;
    shell.current.go(to, state);
    return true;
  }, []);
  const value = useMemo(
    () => ({ held, join, leave, save, discard, discardUnsaveable, setShell, ask, go }),
    [held, join, leave, save, discard, discardUnsaveable, setShell, ask, go],
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
  const { dirty, label, brief, kind, many } = draft;
  const saveable = draft.save !== undefined;
  // Two editors of one kind may be mounted at once (two findings' note boxes), so the registry's key is the editor's own as well as its name.
  const own = useId();
  const key = `${id}:${own}`;
  useEffect(() => {
    if (!join) return;
    join(key, {
      dirty,
      label,
      brief,
      kind,
      many,
      save: saveable ? () => latest.current.save?.() ?? Promise.resolve(false) : undefined,
      discard: () => latest.current.discard(),
    });
  }, [join, key, dirty, label, brief, kind, many, saveable]);
  useEffect(() => {
    if (!leave) return;
    return () => leave(key);
  }, [leave, key]);
}

/** For the app shell: what is held now, the one Save and the one Discard that reach every holder, and the hooks it plugs its guarded moves into. */
export function useUnsavedDrafts(): Pick<Registry, 'held' | 'save' | 'discard' | 'discardUnsaveable' | 'setShell'> {
  const registry = useContext(DraftsContext);
  return useMemo(() => registry ?? { held: [], save: async () => true, discard: () => {}, discardUnsaveable: () => {}, setShell: () => {} }, [registry]);
}

/** Wraps a change inside a page that would drop an editor's draft (another category, another entry, Close): `run` goes ahead at once, or after the question. */
export function useGuardedAction(): (run: () => void, options?: AskOptions) => void {
  return useContext(DraftsContext)?.ask ?? ((run) => run());
}

/** The router's `navigate` for a link that leaves the page: it takes the shell's guarded move, so the unsaved question and the Booth's leave question apply. */
export function useGuardedNavigate(): (to: string, options?: NavigateOptions) => void {
  const go = useContext(DraftsContext)?.go;
  const navigate = useNavigate();
  return useCallback((to, options) => (go?.(to, options?.state) ? undefined : navigate(to, options)), [go, navigate]);
}
