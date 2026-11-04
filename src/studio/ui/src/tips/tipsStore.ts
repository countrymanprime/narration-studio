import { usePort } from '../ports/usePort';

type SystemPort = ReturnType<typeof usePort<'system'>>;

/** The settings field that holds the dismissed tips: their ids, separated by spaces. Global, so a tip is shown once per narrator. */
const TOOL = 'Tips';
const KEY = 'seen';

/** What a component sees of the dismissed tips: `null` until the host has answered, then the set. A failed read stays `null`: no tip is shown on a guess. */
type TipsSnapshot = ReadonlySet<string> | null;

export type TipsStore = {
  snapshot(): TipsSnapshot;
  subscribe(listener: () => void): () => void;
  /** Reads the host's list once; later calls share the first read. */
  load(): Promise<void>;
  /** Marks a tip dismissed at once and saves the list. Returns the sentence of a failed save, after taking only this change back; null when it saved. */
  dismiss(id: string): Promise<string | null>;
  /** Forgets every dismissed tip at once and saves the empty list, so each tip shows again. Same return as `dismiss`. */
  reset(): Promise<string | null>;
  /** Whether the host's list could not be read: the snapshot is `null` for that as it is while loading. `load()` tries again. */
  failed(): boolean;
};

const parse = (value: unknown): Set<string> => new Set((typeof value === 'string' ? value : '').split(/\s+/).filter(Boolean));

/** A change not yet confirmed by the host: one tip dismissed, or `null` for every tip forgotten. */
type Change = { id: string } | null;
const apply = (base: ReadonlySet<string>, change: Change): Set<string> => (change === null ? new Set() : new Set([...base, change.id]));

/**
 * One store for each host, so every tip on a page shares one read and writes merge instead of overwriting each other. The list the host
 * confirmed and the changes still being saved are kept apart: what is shown is the first with the second applied, and a refused save drops
 * only its own change, so a failed dismiss can neither bring back what a later reset cleared nor lose a dismiss that saved after a failed
 * reset. Saves go one at a time, each written over the list the host held when it starts.
 */
export function createTipsStore(system: SystemPort): TipsStore {
  let confirmed: ReadonlySet<string> | null = null;
  let shown: TipsSnapshot = null;
  let loadFailed = false;
  let loading: Promise<void> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const pending: Change[] = [];
  const listeners = new Set<() => void>();
  const refresh = () => {
    shown = pending.length === 0 ? confirmed : pending.reduce<ReadonlySet<string>>(apply, confirmed ?? new Set<string>());
    listeners.forEach((listener) => listener());
  };
  const load = (): Promise<void> => {
    loading ??= system
      .settingsForScope('global')
      .then((settings) => {
        confirmed = parse(settings[TOOL]?.find((field) => field.key === KEY)?.effectiveValue);
        loadFailed = false;
        refresh();
      })
      .catch(() => {
        // Tips are help, not the work: a read that fails shows none, and the next page that mounts, or a retry, reads again.
        loading = null;
        loadFailed = true;
        refresh();
      });
    return loading;
  };
  const change = (next: Change): Promise<string | null> => {
    pending.push(next);
    refresh();
    const job = queue.then(async () => {
      await load();
      try {
        const list = apply(confirmed ?? new Set(), next);
        await system.saveSettings(TOOL, 'global', { [KEY]: [...list].join(' ') });
        confirmed = list;
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      } finally {
        pending.splice(pending.indexOf(next), 1);
        refresh();
      }
    });
    queue = job;
    return job;
  };
  return {
    snapshot: () => shown,
    failed: () => loadFailed,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    dismiss: (id) => change({ id }),
    reset: () => change(null),
  };
}
