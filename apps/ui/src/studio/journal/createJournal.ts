// The command journal (ADR 0771). Every change a page makes goes through `act`, which runs a command and, when the host
// accepts it, records one entry: the label, the read-model keys it touched and how to take it back. `undo(id)` runs the
// entry's inverse unless a refusal rule applies, and shows the host's own sentence when the host refuses. Entries live in
// memory, the newest 40, and `clear()` empties them for a project switch. Redo is not built (rule 8).
//
// The journal never imports the store, the overlay or the DAW port: the DAW's name and its last-action check are injected, and
// an inverse is a closure the caller passes. The store composition (SNS-7) wires it to the project switch and the toasts.

import { createLeaveGuard, type LeaveGuardStore } from './leaveGuard';

/** Structural on purpose: the shared `Refusal` schema belongs to the contract kit, and the compositions unify the two. */
export type Refusal = { code: string; reason: string };

export type Result<R> = { ok: true; value: R } | { ok: false; refusal: Refusal };

export type Command<R> = {
  /** The sentence the history list and the refusals show ("Added a bookmark"). */
  label: string;
  /** Read-model keys the change touches, as `domain/id` or a whole `domain` (ADR 0771 rule 3). */
  touches: string[];
  /** The change is made in the DAW too (rule 4). */
  daw?: boolean;
  run(): Promise<Result<R>>;
  /** The inverse host command, given what `run` returned. It may answer a value the caller needs, such as a replacement id. */
  undo?(result: R): Promise<Result<unknown>>;
  /** Why a command with no `undo` has none (rule 7); a default sentence is used when it is left out. */
  notUndoableReason?: string;
};

/** What the DAW says about the entry at the head of its own undo history. Until the DAW port can report it, answer 'unknown'. */
export type DawLastAction = () => Promise<'this' | 'other' | 'unknown'>;

export type JournalOptions = {
  /** The DAW's name as the narrator knows it, read when a sentence is built. */
  dawName: () => string;
  dawLastAction: DawLastAction;
};

/** One history row. `refusal` is the sentence Undo would give right now, or null when Undo would go ahead. */
export type HistoryRow = {
  id: number;
  label: string;
  daw: boolean;
  touches: readonly string[];
  undoable: boolean;
  refusal: string | null;
};

export type Journal = LeaveGuardStore & {
  /** Runs the command; a refusal is returned unchanged and journals nothing. */
  act<R>(command: Command<R>): Promise<Result<{ id: number; value: R }>>;
  undo(id: number): Promise<Result<unknown>>;
  undoLast(): Promise<Result<unknown>>;
  /** Newest first. Async because a DAW entry's refusal depends on what the DAW reports. */
  entries(): Promise<HistoryRow[]>;
  /** Empties the journal (a project switch). */
  clear(): void;
  /** Calls `listener` after the journal changes; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
};

/** ADR 0771 rule 2. */
const JOURNAL_LIMIT = 40;

type Entry = {
  id: number;
  label: string;
  daw: boolean;
  touches: readonly string[];
  /** Runs the inverse with the value `run` returned; absent when the command has none. */
  inverse: (() => Promise<Result<unknown>>) | null;
  notUndoableReason: string;
};

const refusal = (code: string, reason: string): Result<never> => ({ ok: false, refusal: { code, reason } });

/** Two keys overlap when one is the other or a whole-segment prefix of it, so `bookmarks` covers `bookmarks/12` and `bookmarks/1` does not. */
const keysOverlap = (a: string, b: string): boolean => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const entriesOverlap = (a: Entry, b: Entry): boolean => a.touches.some((p) => b.touches.some((q) => keysOverlap(p, q)));

/** The host's answer is shown as it comes, so anything that is not a well-formed `Result` is a failed undo. */
function isResult(answer: unknown): answer is Result<unknown> {
  if (typeof answer !== 'object' || answer === null) return false;
  const r = answer as { ok?: unknown; refusal?: { reason?: unknown } };
  return r.ok === true || (r.ok === false && typeof r.refusal?.reason === 'string');
}

export function createJournal(options: JournalOptions): Journal {
  const { dawName, dawLastAction } = options;
  const leaveGuard = createLeaveGuard();
  let entries: Entry[] = [];
  let nextId = 0;
  // Entries whose inverse is running, so a double click cannot run it twice.
  const undoing = new Set<number>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const notUndoableSentence = (command: Command<unknown>): string =>
    command.notUndoableReason ??
    (command.daw
      ? `This change was made in ${dawName()} and the app cannot undo it. Use Edit > Undo in ${dawName()}.`
      : 'This change cannot be undone in the app.');

  // Every refusal that does not need to ask the DAW, in the order ADR 0771 gives them.
  function staticRefusal(entry: Entry): Refusal | null {
    if (!entry.inverse) return { code: 'not-undoable', reason: entry.notUndoableReason };
    const later = entries.slice(entries.findIndex((e) => e.id === entry.id) + 1);
    const newest = later[later.length - 1];
    if (entry.daw && newest) return { code: 'daw-came-after', reason: `Undo '${newest.label}' first. It came after this.` };
    return null;
  }

  const sameThing = (entry: Entry): Refusal | null => {
    const later = entries.slice(entries.findIndex((e) => e.id === entry.id) + 1);
    const blocker = later.filter((e) => entriesOverlap(e, entry)).pop();
    return blocker ? { code: 'same-thing', reason: `Undo '${blocker.label}' first. It changed the same thing.` } : null;
  };

  async function dawRefusal(entry: Entry): Promise<Refusal | null> {
    if (!entry.daw) return null;
    const answer = await dawLastAction().catch(() => 'unknown' as const);
    if (answer === 'this') return null;
    const name = dawName();
    return { code: 'daw-last-action', reason: `${name}'s last action is not this one, so it was left alone. Use Edit > Undo in ${name}.` };
  }

  async function refusalFor(entry: Entry): Promise<Refusal | null> {
    return staticRefusal(entry) ?? (await dawRefusal(entry)) ?? sameThing(entry);
  }

  async function act<R>(command: Command<R>): Promise<Result<{ id: number; value: R }>> {
    const result = await command.run();
    if (!result.ok) return result;
    const { undo } = command;
    const entry: Entry = {
      id: ++nextId,
      label: command.label,
      daw: command.daw === true,
      touches: [...command.touches],
      inverse: undo ? () => undo.call(command, result.value) : null,
      notUndoableReason: undo ? '' : notUndoableSentence(command),
    };
    entries = [...entries, entry].slice(-JOURNAL_LIMIT);
    emit();
    return { ok: true, value: { id: entry.id, value: result.value } };
  }

  async function undo(id: number): Promise<Result<unknown>> {
    const entry = entries.find((e) => e.id === id);
    // An entry whose inverse is still running is as good as gone.
    if (!entry || undoing.has(id)) return refusal('already-undone', 'Already undone.');
    undoing.add(id);
    try {
      const blocked = await refusalFor(entry);
      if (blocked) return { ok: false, refusal: blocked };
      let answer: unknown;
      try {
        answer = await entry.inverse!();
      } catch {
        return refusal('undo-failed', 'That change could not be undone.');
      }
      if (!isResult(answer)) return refusal('undo-failed', 'That change could not be undone.');
      if (answer.ok) {
        entries = entries.filter((e) => e.id !== id);
        emit();
      }
      return answer;
    } finally {
      undoing.delete(id);
    }
  }

  return {
    ...leaveGuard,
    act,
    undo,
    undoLast: async () => {
      const last = entries[entries.length - 1];
      return last ? undo(last.id) : refusal('nothing-to-undo', 'Nothing to undo');
    },
    entries: async () => {
      const snapshot = [...entries];
      const rows = await Promise.all(
        snapshot.map(async (entry): Promise<HistoryRow> => {
          const blocked = entries.some((e) => e.id === entry.id) ? await refusalFor(entry) : null;
          return {
            id: entry.id,
            label: entry.label,
            daw: entry.daw,
            touches: entry.touches,
            undoable: entry.inverse !== null,
            refusal: blocked?.reason ?? null,
          };
        }),
      );
      return rows.reverse();
    },
    clear: () => {
      entries = [];
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
