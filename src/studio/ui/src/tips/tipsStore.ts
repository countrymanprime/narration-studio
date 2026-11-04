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
  /** Marks a tip dismissed at once and saves the list. Returns the sentence of a failed save, after putting the tip back; null when it saved. */
  dismiss(id: string): Promise<string | null>;
  /** Forgets every dismissed tip at once and saves the empty list, so each tip shows again. Same return as `dismiss`. */
  reset(): Promise<string | null>;
};

const parse = (value: string): Set<string> => new Set(value.split(/\s+/).filter(Boolean));

/** One store for each host, so every tip on a page shares one read and writes merge instead of overwriting each other. */
export function createTipsStore(system: SystemPort): TipsStore {
  let seen: TipsSnapshot = null;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const set = (next: TipsSnapshot) => {
    seen = next;
    listeners.forEach((listener) => listener());
  };
  /** Saves the list as it now stands; on a refusal puts `before` back and returns the host's sentence. */
  const save = async (before: ReadonlySet<string>): Promise<string | null> => {
    try {
      await system.saveSettings(TOOL, 'global', { [KEY]: [...(seen ?? [])].join(' ') });
      return null;
    } catch (error) {
      set(before);
      return error instanceof Error ? error.message : String(error);
    }
  };
  return {
    snapshot: () => seen,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load() {
      loading ??= system
        .settingsForScope('global')
        .then((settings) => set(parse(settings[TOOL]?.find((field) => field.key === KEY)?.effectiveValue ?? '')))
        .catch(() => {
          // Tips are help, not the work: a read that fails shows none, and the next page that mounts reads again.
          loading = null;
        });
      return loading;
    },
    async dismiss(id) {
      const before = seen ?? new Set<string>();
      set(new Set([...before, id]));
      return save(before);
    },
    async reset() {
      const before = seen ?? new Set<string>();
      set(new Set());
      return save(before);
    },
  };
}
