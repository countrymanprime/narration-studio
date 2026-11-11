import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// The registry of drafts: text a page holds that is not saved yet and that leaving the page would drop (#3400). A holder joins with
// `useUnsavedDraft`; the app shell asks `useUnsavedDrafts` whether anything is held before every exit (the nav, Back and Forward, the jump
// menu, Switch project) and puts one question to the narrator ("Save & continue", "Discard & continue", "Cancel"). Settings' own fields keep
// their separate registry (`SettingsFormsProvider`), because they save as a form; this one is for every other editor with a Save of its own.

/** What a holder tells the shell. `label` finishes "Save or discard ___ before leaving?" ("your changes to this entry"). */
export type UnsavedDraft = {
  /** Whether the editor holds text that differs from what is saved. */
  dirty: boolean;
  label: string;
  /** Saves the draft; resolves true when it is saved (the editor says why in its own words when it is not, and the narrator stays). */
  save: () => Promise<boolean>;
  /** Drops the draft. The page is about to go, so this only has to settle what must not outlive it. */
  discard: () => void;
};

type Registry = {
  /** The labels of the drafts held now, in the order they were first held. */
  held: readonly string[];
  join: (id: string, draft: UnsavedDraft) => void;
  leave: (id: string) => void;
  save: () => Promise<boolean>;
  discard: () => void;
};

const DraftsContext = createContext<Registry | undefined>(undefined);

/** Mounted once, above the routes. */
export function UnsavedDraftsProvider({ children }: { children: ReactNode }) {
  const drafts = useRef(new Map<string, UnsavedDraft>());
  const [held, setHeld] = useState<readonly string[]>([]);
  const publish = useCallback(() => {
    const next = [...drafts.current.values()].filter((draft) => draft.dirty).map((draft) => draft.label);
    setHeld((current) => (current.length === next.length && current.every((label, index) => label === next[index]) ? current : next));
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
  const save = useCallback(async () => {
    for (const draft of [...drafts.current.values()].filter((entry) => entry.dirty)) if (!(await draft.save())) return false;
    return true;
  }, []);
  const discard = useCallback(() => {
    for (const draft of [...drafts.current.values()].filter((entry) => entry.dirty)) draft.discard();
  }, []);
  const value = useMemo(() => ({ held, join, leave, save, discard }), [held, join, leave, save, discard]);
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
  const { dirty, label } = draft;
  useEffect(() => {
    if (!join) return;
    join(id, {
      dirty,
      label,
      save: () => latest.current.save(),
      discard: () => latest.current.discard(),
    });
  }, [join, id, dirty, label]);
  useEffect(() => {
    if (!leave) return;
    return () => leave(id);
  }, [leave, id]);
}

/** For the app shell: what is held now, and the one Save and the one Discard that reach every holder. */
export function useUnsavedDrafts(): Pick<Registry, 'held' | 'save' | 'discard'> {
  const registry = useContext(DraftsContext);
  return useMemo(() => registry ?? { held: [], save: async () => true, discard: () => {} }, [registry]);
}
