import { describe, expect, it, vi } from 'vitest';
import type { DawResult } from '../../../api/contracts/daw';
import { createJournal } from '../../../studio/journal/createJournal';
import { recordedTakeCommand, TAKE_SCRIPT_OUTDATED } from './takeCommand';

const stopped = (undoSteps: number): DawResult => ({ ok: true, changed: true, message: '', undoSteps });
const undone: DawResult = { ok: true, changed: true, message: 'Undid the take in REAPER.', undoSteps: 0 };
const notLast = "REAPER's last action is not this one, so it was left alone. Use Edit > Undo in REAPER.";

function journalFor(last: 'this' | 'other' | 'unknown') {
  const asked: unknown[] = [];
  const journal = createJournal({
    dawName: () => 'REAPER',
    dawLastAction: async (action) => {
      asked.push(action);
      return last;
    },
  });
  return { journal, asked };
}

describe('recordedTakeCommand', () => {
  it('is one DAW entry whose undo asks the DAW to undo the points the take left', async () => {
    const undoLast = vi.fn(async () => undone);
    const { journal, asked } = journalFor('this');
    const done = await journal.act(recordedTakeCommand({ daw: { undoLast }, result: stopped(2), title: 'Chapter 1' }));
    expect(done.ok).toBe(true);
    const [row] = await journal.entries();
    expect(row).toMatchObject({ label: 'Recorded a take of Chapter 1', daw: true, undoable: true, refusal: null });
    expect(asked).toEqual([{ kind: 'record_take', steps: 2 }]);
    expect(await journal.undoLast()).toEqual({ ok: true, value: undone });
    expect(undoLast).toHaveBeenCalledWith('record_take', 2);
    expect(await journal.entries()).toEqual([]);
  });

  it('is refused, and the DAW is never asked to undo, when the take is no longer the DAW last action', async () => {
    const undoLast = vi.fn(async () => undone);
    const { journal } = journalFor('other');
    await journal.act(recordedTakeCommand({ daw: { undoLast }, result: stopped(1), title: 'Chapter 1' }));
    expect(await journal.undoLast()).toEqual({ ok: false, refusal: { code: 'daw-last-action', reason: notLast } });
    expect(undoLast).not.toHaveBeenCalled();
  });

  it('keeps the entry and says the DAW sentence when the DAW refuses the undo itself', async () => {
    const refused: DawResult = { ok: false, changed: false, message: notLast, undoSteps: 0, refused: notLast };
    const { journal } = journalFor('this');
    await journal.act(recordedTakeCommand({ daw: { undoLast: async () => refused }, result: stopped(1), title: 'Chapter 1' }));
    expect(await journal.undoLast()).toEqual({ ok: false, refusal: { code: 'daw_refused', reason: notLast } });
    expect(await journal.entries()).toHaveLength(1);
  });

  it('says a call that failed, and keeps the entry', async () => {
    const { journal } = journalFor('this');
    await journal.act(
      recordedTakeCommand({
        daw: {
          undoLast: async () => {
            throw new Error('the bridge did not answer');
          },
        },
        result: stopped(1),
        title: 'Chapter 1',
      }),
    );
    expect(await journal.undoLast()).toEqual({ ok: false, refusal: { code: 'daw_refused', reason: 'the bridge did not answer' } });
    expect(await journal.entries()).toHaveLength(1);
  });

  it('with no undo points (an older script in the DAW) has no undo, and says why', async () => {
    const undoLast = vi.fn(async () => undone);
    const { journal } = journalFor('this');
    await journal.act(recordedTakeCommand({ daw: { undoLast }, result: stopped(0), title: 'Chapter 1' }));
    const [row] = await journal.entries();
    expect(row).toMatchObject({ undoable: false, refusal: TAKE_SCRIPT_OUTDATED });
    expect(await journal.undoLast()).toEqual({ ok: false, refusal: { code: 'not-undoable', reason: TAKE_SCRIPT_OUTDATED } });
    expect(undoLast).not.toHaveBeenCalled();
  });

  it('never asks for more points than one undo may take back', async () => {
    const undoLast = vi.fn(async () => undone);
    const { journal } = journalFor('this');
    await journal.act(recordedTakeCommand({ daw: { undoLast }, result: stopped(13), title: 'Chapter 1' }));
    expect((await journal.entries())[0]).toMatchObject({ undoable: false });
  });
});
