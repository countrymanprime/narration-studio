import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createJournal, type Command, type DawLastAction, type Result } from './createJournal';

const ok = <R>(value: R): Result<R> => ({ ok: true, value });
const refuse = (reason: string, code = 'refused'): Result<never> => ({ ok: false, refusal: { code, reason } });

/** A command with an inverse that records its calls. */
function cmd(label: string, touches: string[], extra: Partial<Command<null>> = {}) {
  const undo = vi.fn(async () => ok<unknown>(undefined));
  const command: Command<null> = { label, touches, run: async () => ok(null), undo, ...extra };
  return { command, undo };
}

function setup(dawLastAction: DawLastAction = async () => 'unknown') {
  return createJournal({ dawName: () => 'REAPER', dawLastAction });
}

async function added(journal: ReturnType<typeof setup>, command: Command<null>): Promise<number> {
  const result = await journal.act(command);
  if (!result.ok) throw new Error('act refused');
  return result.value.id;
}

describe('journal.act', () => {
  it('act-journals-one-entry-per-action: a successful run adds one entry, a refused run adds none', async () => {
    const journal = setup();
    const { command } = cmd('Added a bookmark', ['bookmarks/12'], { daw: true });
    const result = await journal.act(command);
    expect(result.ok).toBe(true);
    expect(await journal.entries()).toEqual([
      expect.objectContaining({ id: expect.any(Number), label: 'Added a bookmark', daw: true, touches: ['bookmarks/12'], undoable: true }),
    ]);

    const refusal = { code: 'stale', reason: 'The evidence changed.' };
    const refused = await journal.act({ label: 'Nope', touches: ['findings/f-1'], run: async () => ({ ok: false, refusal }) });
    expect(refused).toEqual({ ok: false, refusal });
    expect(await journal.entries()).toHaveLength(1);
  });

  it('hands the command value back with the entry id so a toast can offer Undo for exactly this change', async () => {
    const journal = setup();
    const result = await journal.act({ label: 'Added', touches: ['bookmarks/7'], run: async () => ok({ newId: 7 }), undo: async () => ok(undefined) });
    expect(result).toEqual({ ok: true, value: { id: expect.any(Number), value: { newId: 7 } } });
  });

  it('forty-entries-cleared-on-switch: the 41st entry drops the oldest and clear() empties the journal', async () => {
    const journal = setup();
    const ids: number[] = [];
    for (let i = 0; i < 41; i++) ids.push(await added(journal, cmd(`E${i}`, [`k/${i}`]).command));
    const rows = await journal.entries();
    expect(rows).toHaveLength(40);
    expect(rows.map((r) => r.id)).not.toContain(ids[0]);
    expect(rows[0]!.label).toBe('E40');
    journal.clear();
    expect(await journal.entries()).toEqual([]);
  });

  it('history-listing-is-newest-first: rows carry label, daw flag and the refusal Undo would give now', async () => {
    const journal = setup();
    await added(journal, cmd('First', ['bookmarks/1']).command);
    await added(journal, cmd('Second', ['bookmarks']).command);
    await added(journal, cmd('Third', ['findings/f-3']).command);
    const rows = await journal.entries();
    expect(rows.map((r) => r.label)).toEqual(['Third', 'Second', 'First']);
    expect(rows.map((r) => r.refusal)).toEqual([null, null, "Undo 'Second' first. It changed the same thing."]);
    expect(rows.every((r) => r.daw === false)).toBe(true);
  });

  it('tells subscribers when the journal changes and stops after unsubscribe', async () => {
    const journal = setup();
    const listener = vi.fn();
    const stop = journal.subscribe(listener);
    const id = await added(journal, cmd('A', ['a']).command);
    expect(listener).toHaveBeenCalledTimes(1);
    await journal.undo(id);
    expect(listener).toHaveBeenCalledTimes(2);
    journal.clear();
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    await added(journal, cmd('B', ['b']).command);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('journal.undo', () => {
  it('undo-by-name-restores-and-removes: calls the inverse with the run value, removes the entry; a second undo refuses', async () => {
    const journal = setup();
    const undo = vi.fn(async () => ok<unknown>(undefined));
    const result = await journal.act({ label: 'Added a bookmark', touches: ['bookmarks/12'], run: async () => ok({ id: 12 }), undo });
    if (!result.ok) throw new Error('act refused');
    const { id } = result.value;

    expect(await journal.undo(id)).toEqual({ ok: true, value: undefined });
    expect(undo).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    expect(await journal.entries()).toEqual([]);

    expect(await journal.undo(id)).toEqual({ ok: false, refusal: { code: 'already-undone', reason: 'Already undone.' } });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('same-thing-refusal: names the newest overlapping later entry and changes nothing', async () => {
    const journal = setup();
    const a = cmd('Edited a bookmark', ['bookmarks/12']);
    const b = cmd('Cleared bookmarks', ['bookmarks']);
    const c = cmd('Added a finding', ['bookmarks/12']);
    const idA = await added(journal, a.command);
    await added(journal, b.command);
    await added(journal, c.command);
    expect(await journal.undo(idA)).toEqual({
      ok: false,
      refusal: { code: 'same-thing', reason: "Undo 'Added a finding' first. It changed the same thing." },
    });
    expect(a.undo).not.toHaveBeenCalled();
    expect(await journal.entries()).toHaveLength(3);
  });

  it('treats keys as overlapping on a whole segment prefix, not a string prefix', async () => {
    const journal = setup();
    const idA = await added(journal, cmd('A', ['bookmarks/1']).command);
    await added(journal, cmd('B', ['bookmarks/12']).command);
    expect((await journal.undo(idA)).ok).toBe(true);
  });

  it('disjoint-entries-undo-out-of-order: entries on different keys undo in either order', async () => {
    for (const order of [
      [0, 1],
      [1, 0],
    ] as const) {
      const journal = setup();
      const ids = [await added(journal, cmd('A', ['bookmarks/12']).command), await added(journal, cmd('B', ['findings/f-3']).command)];
      expect((await journal.undo(ids[order[0]]!)).ok).toBe(true);
      expect((await journal.undo(ids[order[1]]!)).ok).toBe(true);
      expect(await journal.entries()).toEqual([]);
    }
  });

  it('undoLast undoes the newest entry and refuses on an empty journal', async () => {
    const journal = setup();
    expect(await journal.undoLast()).toEqual({ ok: false, refusal: { code: 'nothing-to-undo', reason: 'Nothing to undo' } });
    const a = cmd('A', ['a']);
    const b = cmd('B', ['b']);
    await added(journal, a.command);
    await added(journal, b.command);
    expect((await journal.undoLast()).ok).toBe(true);
    expect(b.undo).toHaveBeenCalledTimes(1);
    expect(a.undo).not.toHaveBeenCalled();
  });

  it('refuses a second undo of an entry whose inverse is still running', async () => {
    const journal = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = cmd('Slow', ['a'], { undo: vi.fn(async () => (await gate, ok<unknown>(undefined))) });
    const id = await added(journal, slow.command);
    const first = journal.undo(id);
    expect(await journal.undo(id)).toMatchObject({ ok: false, refusal: { reason: 'Already undone.' } });
    release();
    expect((await first).ok).toBe(true);
    expect(slow.command.undo).toHaveBeenCalledTimes(1);
  });
});

describe('DAW entries (ADR 0771 rule 4)', () => {
  it('daw-entry-only-if-last: an entry followed by any entry refuses "came after this", naming the newest', async () => {
    const dawLastAction = vi.fn<DawLastAction>(async () => 'this');
    const journal = setup(dawLastAction);
    const daw = cmd('Put back a backup', ['backups/b1'], { daw: true });
    const idDaw = await added(journal, daw.command);
    await added(journal, cmd('Added a bookmark', ['bookmarks/1']).command);
    expect(await journal.undo(idDaw)).toEqual({
      ok: false,
      refusal: { code: 'daw-came-after', reason: "Undo 'Added a bookmark' first. It came after this." },
    });
    expect(dawLastAction).not.toHaveBeenCalled();
    expect(daw.undo).not.toHaveBeenCalled();
  });

  it.each(['unknown', 'other'] as const)("refuses the DAW's own Edit > Undo sentence when the DAW reports '%s'", async (answer) => {
    const journal = setup(async () => answer);
    const daw = cmd('Put back a backup', ['backups/b1'], { daw: true });
    const id = await added(journal, daw.command);
    const expected = {
      ok: false,
      refusal: { code: 'daw-last-action', reason: "REAPER's last action is not this one, so it was left alone. Use Edit > Undo in REAPER." },
    };
    expect(await journal.undo(id)).toEqual(expected);
    expect((await journal.entries())[0]!.refusal).toBe(expected.refusal.reason);
    expect(daw.undo).not.toHaveBeenCalled();
    expect(await journal.entries()).toHaveLength(1);
  });

  it('undoes the last DAW entry when the DAW reports it is still its last action', async () => {
    const journal = setup(async () => 'this');
    const daw = cmd('Put back a backup', ['backups/b1'], { daw: true });
    const id = await added(journal, daw.command);
    expect((await journal.entries())[0]!.refusal).toBeNull();
    expect((await journal.undo(id)).ok).toBe(true);
    expect(daw.undo).toHaveBeenCalledTimes(1);
  });

  it('names the DAW at the time of the refusal', async () => {
    let name = 'REAPER';
    const journal = createJournal({ dawName: () => name, dawLastAction: async () => 'unknown' });
    const id = await added(journal, cmd('X', ['x'], { daw: true }).command);
    name = 'Audacity';
    expect(await journal.undo(id)).toMatchObject({ refusal: { reason: expect.stringContaining("Audacity's last action") } });
  });

  it('treats a thrown DAW check as unknown', async () => {
    const journal = setup(async () => {
      throw new Error('bridge down');
    });
    const id = await added(journal, cmd('X', ['x'], { daw: true }).command);
    expect(await journal.undo(id)).toMatchObject({ refusal: { code: 'daw-last-action' } });
  });
});

describe('the host may refuse an inverse (rule 5)', () => {
  it("host-refusal-is-shown-as-it-comes: keeps the entry and returns the host's sentence", async () => {
    const journal = setup();
    const refusal = { code: 'evidence-changed', reason: 'The evidence for this finding changed.' };
    const c = cmd('Dismissed a line', ['findings/f-3'], { undo: async () => ({ ok: false, refusal }) });
    const id = await added(journal, c.command);
    expect(await journal.undo(id)).toEqual({ ok: false, refusal });
    expect(await journal.entries()).toHaveLength(1);
  });

  it.each([
    [
      'throws',
      async () => {
        throw new Error('boom');
      },
    ],
    ['rejects', () => Promise.reject(new Error('boom'))],
    ['answers nothing', async () => undefined],
    ['answers a refusal with no sentence', async () => ({ ok: false, refusal: { code: 'x' } })],
    ['answers a non-boolean ok', async () => ({ ok: 'yes' })],
  ])('says "That change could not be undone." when the inverse %s, and keeps the entry', async (_name, undo) => {
    const journal = setup();
    const id = await added(journal, cmd('A', ['a'], { undo: undo as never }).command);
    expect(await journal.undo(id)).toEqual({ ok: false, refusal: { code: 'undo-failed', reason: 'That change could not be undone.' } });
    expect(await journal.entries()).toHaveLength(1);
  });
});

describe('commands with no safe inverse (rule 7)', () => {
  it('not-undoable-entries-are-listed: journalled with undoable:false and a reason; undo refuses with it', async () => {
    const journal = setup();
    const id = await added(
      journal,
      cmd('Merged A into B', ['bible/a', 'bible/b'], { undo: undefined, notUndoableReason: 'No command splits an entity back.' }).command,
    );
    const [row] = await journal.entries();
    expect(row).toMatchObject({ id, label: 'Merged A into B', undoable: false, refusal: 'No command splits an entity back.' });
    expect(await journal.undo(id)).toEqual({ ok: false, refusal: { code: 'not-undoable', reason: 'No command splits an entity back.' } });
    expect(await journal.entries()).toHaveLength(1);
  });

  it("names the DAW's Edit > Undo for a DAW change with no reason of its own, and a plain sentence otherwise", async () => {
    const journal = setup();
    const daw = await added(journal, cmd('Put back a backup', ['backups/b1'], { daw: true, undo: undefined }).command);
    expect(await journal.undo(daw)).toMatchObject({
      refusal: { code: 'not-undoable', reason: 'This change was made in REAPER and the app cannot undo it. Use Edit > Undo in REAPER.' },
    });
    const plain = await added(journal, cmd('Merged', ['bible/a'], { undo: undefined }).command);
    expect(await journal.undo(plain)).toMatchObject({
      refusal: { code: 'not-undoable', reason: 'This change cannot be undone in the app.' },
    });
    // A permanent reason is not hidden behind "undo the later change first": undoing that would not help.
    expect((await journal.entries())[1]!.refusal).toContain('Use Edit > Undo in REAPER.');
  });
});

describe('inverses that recreate (rule 6)', () => {
  it('new-id-after-recreate: the replacement id comes back from undo; a later entry naming the old id is refused by the host stub', async () => {
    const live = new Set([12]);
    let next = 100;
    const journal = setup();
    // Delete bookmark 12; the inverse recreates it under a new id.
    await journal.act({
      label: 'Deleted a bookmark',
      touches: ['bookmarks/12'],
      run: async () => (live.delete(12), ok(null)),
      undo: async () => (live.add(++next), ok({ newId: next })),
    });
    // An earlier-looking edit of the old id exists as a separate entry on another key; its inverse targets id 12.
    const editId = await added(
      journal,
      cmd('Moved bookmark 12', ['positions/12'], {
        undo: async () => (live.has(12) ? ok(undefined) : refuse('That bookmark no longer exists.', 'gone')),
      }).command,
    );

    const undone = await journal.undoLast();
    expect(undone).toEqual({ ok: false, refusal: { code: 'gone', reason: 'That bookmark no longer exists.' } });
    expect(await journal.entries()).toHaveLength(2);
    expect((await journal.entries()).map((r) => r.id)).toContain(editId);

    const rows = await journal.entries();
    const deleteRow = rows.find((r) => r.label === 'Deleted a bookmark')!;
    expect(await journal.undo(deleteRow.id)).toEqual({ ok: true, value: { newId: 101 } });
    expect(live.has(101)).toBe(true);
  });
});

describe('undo-then-original-property', () => {
  it('act then undo of UI-only commands, newest first, leaves the value equal to the original', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.array(fc.string(), { minLength: 1, maxLength: 12 }), async (original, writes) => {
        const journal = setup();
        let value = original;
        for (const [i, next] of writes.entries()) {
          await journal.act({
            label: `Set ${i}`,
            touches: ['ui/value'],
            run: async () => {
              const previous = value;
              value = next;
              return ok(previous);
            },
            undo: async (previous: string) => ((value = previous), ok(undefined)),
          });
        }
        for (let i = 0; i < writes.length; i++) expect((await journal.undoLast()).ok).toBe(true);
        expect(value).toBe(original);
        expect(await journal.entries()).toEqual([]);
      }),
    );
  });

  it('refuses every out-of-order undo on one key, so a stale inverse never overwrites a newer value', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 8 }), async (count) => {
        const journal = setup();
        const ids: number[] = [];
        for (let i = 0; i < count; i++) ids.push(await added(journal, cmd(`E${i}`, ['ui/value']).command));
        for (const id of ids.slice(0, -1)) expect(await journal.undo(id)).toMatchObject({ refusal: { code: 'same-thing' } });
        expect(await journal.entries()).toHaveLength(count);
      }),
    );
  });
});
