import { describe, expect, it, vi } from 'vitest';
import { marksDoc } from '../../script/scriptFixtures';
import { summarize } from '../../model';
import { fakeCutLog, locator } from '../cut/cutFixtures';
import { cutCommand } from '../cut/cutCommand';
import { applyFxCommand } from '../fx/fxCommand';
import { appliedSpan, spanForKeys, subWordNote } from './spanRequest';

const doc = marksDoc();
// "was" (p-1:1) is 0.95 to 1.25 and "tired" (p-1:3, after "very", which was not read) is 1.25 to 1.55, so the words run 0.95 to 1.55.
const keys = ['p-1:1', 'p-1:3'];
const whole = { start: 0.95, end: 1.55 };

describe('subWordNote', () => {
  it('is empty when the range sits on the edges of the whole words, within 5 ms', () => {
    expect(subWordNote(whole, whole)).toBe('');
    expect(subWordNote({ start: 0.953, end: 1.547 }, whole)).toBe('');
  });
  it('is empty when there are no whole words to compare with', () => {
    expect(subWordNote(whole, null)).toBe('');
  });
  it('names the exact range, the whole words the DAW acts on, and that the edge is a preview', () => {
    const note = subWordNote({ start: 1, end: 1.5 }, whole);
    expect(note).toBe('Sub-word edge, shown as a preview: your range runs 0:01.00 to 0:01.50, and the DAW acts on the whole words, 0:00.95 to 0:01.55.');
  });
  it('reads one-sided differences too', () => {
    expect(subWordNote({ start: 0.95, end: 1.2 }, whole)).toMatch(/0:00.95 to 0:01.20.*0:00.95 to 0:01.55/);
  });
});

describe('which words a drawn range belongs to', () => {
  const span = { start: 1, end: 1.5 };
  it('is the range when the words asked about are the selection, in any order', () => {
    expect(spanForKeys(span, ['b', 'a'], ['a', 'b'])).toBe(span);
  });
  it('is nothing for other words, a different count, or no range', () => {
    expect(spanForKeys(span, ['a', 'c'], ['a', 'b'])).toBeUndefined();
    expect(spanForKeys(span, ['a'], ['a', 'b'])).toBeUndefined();
    expect(spanForKeys(null, ['a'], ['a'])).toBeUndefined();
    expect(spanForKeys(undefined, [], [])).toBeUndefined();
  });
  it('the whole words a cut works on run from the first start to the last end', () => {
    expect(appliedSpan(summarize(doc, keys, [], (t) => t).audible)).toEqual(whole);
    expect(appliedSpan([])).toBeNull();
  });
});

describe('cut and effect requests built from a time span', () => {
  const sum = summarize(doc, keys, [], (t) => t);
  const dawOk = { ok: true, changed: true, message: 'Deleted in REAPER.', undoSteps: 1 };

  it('the cut asks the DAW for the covered words by token only, never a time, and says the edge is a preview', async () => {
    const deleteRange = vi.fn(async () => dawOk);
    const cut = cutCommand(
      { daw: { deleteRange, undoLast: vi.fn() }, log: fakeCutLog(), onCuts: () => {} },
      { kind: 'daw', dawName: 'REAPER' },
      { chapterId: 'chapter-1', summary: sum, options: { mode: 'close', fadeMs: 12 }, mute: false, locator, span: { start: 1, end: 1.5 } },
    );
    const res = await cut.run();
    expect(deleteRange).toHaveBeenCalledTimes(1);
    const sent = (deleteRange.mock.calls as unknown as [Record<string, unknown>][])[0][0];
    expect(sent).toMatchObject({ chapterId: 'chapter-1', firstToken: 1, lastToken: 3, mode: 'close', fadeMs: 12 });
    expect(Object.keys(sent).sort()).toEqual(['chapterId', 'fadeMs', 'firstToken', 'lastToken', 'mode']);
    expect(res.ok && res.value.message).toBe(`Deleted in REAPER. ${subWordNote({ start: 1, end: 1.5 }, whole)}`);
  });

  it('a range on the word edges adds nothing to the cut, and no span is the cut as it was', async () => {
    for (const span of [whole, undefined]) {
      const cut = cutCommand(
        { daw: { deleteRange: async () => dawOk, undoLast: vi.fn() }, log: fakeCutLog(), onCuts: () => {} },
        { kind: 'daw', dawName: 'REAPER' },
        { chapterId: 'chapter-1', summary: sum, options: { mode: 'close', fadeMs: 12 }, mute: false, locator, ...(span ? { span } : {}) },
      );
      const res = await cut.run();
      expect(res.ok && res.value.message).toBe('Deleted in REAPER.');
    }
  });

  it('the effect asks for the covered words by token only and says the edge is a preview', async () => {
    const applyFxToRange = vi.fn(async () => ({ ...dawOk, message: 'Added Voice polish in REAPER.' }));
    const record = vi.fn(async () => ({ chapterId: 'chapter-1', effects: [], changed: ['fx1'], over: [] }));
    const fx = applyFxCommand(
      { daw: { applyFxToRange, removeFxFromRange: vi.fn() }, log: { editingWordFxRecord: record, editingWordFxRemove: vi.fn() }, onEffects: () => {} },
      { kind: 'daw', dawName: 'REAPER' },
      {
        chapterId: 'chapter-1',
        range: sum.ranges[0],
        chain: { id: 'polish', name: 'Voice polish' },
        source: 'Your REAPER FX chains',
        locator,
        needsOver: false,
        confirmedOver: false,
        span: { start: 1, end: 1.5 },
      },
    );
    const res = await fx.run();
    const sent = (applyFxToRange.mock.calls as unknown as [Record<string, unknown>][])[0][0];
    expect(sent).toEqual({ chapterId: 'chapter-1', firstToken: 1, lastToken: 3, chainName: 'polish', fadeMs: 8 });
    expect(res.ok && res.value.message).toBe(`Added Voice polish in REAPER. ${subWordNote({ start: 1, end: 1.5 }, whole)}`);
    // the record keeps the whole words: the times the DAW worked on
    expect(record.mock.calls[0]).toBeTruthy();
    expect(JSON.stringify(record.mock.calls[0])).not.toContain('1.5,');
  });
});
