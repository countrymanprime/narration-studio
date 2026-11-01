// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createOverlayService } from '../overlay/overlayService';
import { createJournal, type Journal } from './journal/createJournal';
import { useUndoToastLifetime } from './useUndoToastLifetime';

afterEach(cleanup);

const setup = (scope = '/proof') => {
  const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
  const overlay = createOverlayService();
  const view = renderHook(({ at }) => useUndoToastLifetime(journal, overlay, at), { initialProps: { at: scope } });
  return { journal, overlay, view };
};
const texts = (overlay: ReturnType<typeof createOverlayService>) => overlay.getSnapshot().toasts.map((t) => t.text);
const decide = async (journal: Journal, label: string) => {
  const result = await journal.act({
    label,
    touches: [`findings/${label}`],
    run: async () => ({ ok: true, value: null }),
    undo: async () => ({ ok: true, value: null }),
  });
  if (!result.ok) throw new Error('refused');
  return result.value.id;
};

describe('useUndoToastLifetime', () => {
  it('the Undo toast of a decision goes when the narrator undoes it another way (the keys, History)', async () => {
    const { journal, overlay } = setup();
    const id = await decide(journal, 'Waive');
    act(() => overlay.toastUndo('00:10 · Waive', () => journal.undo(id), { entry: id }));
    expect(texts(overlay)).toEqual(['00:10 · Waive']);
    await act(async () => void (await journal.undoLast()));
    expect(texts(overlay)).toEqual([]);
  });

  it('only the toast of the undone entry goes', async () => {
    const { journal, overlay } = setup();
    const first = await decide(journal, 'One');
    const second = await decide(journal, 'Two');
    act(() => overlay.toastUndo('One', () => journal.undo(first), { entry: first }));
    act(() => overlay.toastUndo('Two', () => journal.undo(second), { entry: second }));
    await act(async () => void (await journal.undo(second)));
    expect(texts(overlay)).toEqual(['One']);
  });

  it('Ctrl+Z and a toast Undo act on the entry each names, after an off-journal change in between', async () => {
    const { journal, overlay } = setup();
    const first = await decide(journal, 'One');
    act(() => overlay.toastUndo('One', () => journal.undo(first), { entry: first }));
    act(() => overlay.toastUndo('Removed a pickup', async () => ({ ok: true }), { offJournal: 'a test change the journal does not hold' }));
    const second = await decide(journal, 'Two');
    act(() => overlay.toastUndo('Two', () => journal.undo(second), { entry: second }));
    // The keys undo the newest entry; its toast goes, the older entry's and the off-journal one stay.
    await act(async () => void (await journal.undoLast()));
    expect(texts(overlay)).toEqual(['One', 'Removed a pickup']);
    expect((await journal.entries()).map((e) => e.id)).toEqual([first]);
    // The older toast's Undo still takes back its own entry, and nothing else.
    await act(async () => void (await journal.undo(first)));
    expect(texts(overlay)).toEqual(['Removed a pickup']);
    expect(await journal.entries()).toEqual([]);
  });

  it('a project switch (the journal is cleared) takes the toast away', async () => {
    const { journal, overlay } = setup();
    const id = await decide(journal, 'Waive');
    act(() => overlay.toastUndo('Waive', () => journal.undo(id), { entry: id }));
    act(() => journal.clear());
    expect(texts(overlay)).toEqual([]);
  });

  it('leaving the page or chapter takes every Undo toast away, with or without a journal entry, and keeps other messages', async () => {
    const { journal, overlay, view } = setup('/editing/chapter-1');
    const id = await decide(journal, 'Cut');
    act(() => overlay.toastUndo('Cut 3 words', () => journal.undo(id), { entry: id }));
    act(() => overlay.toastUndo('Deleted the note', async () => ({ ok: true }), { offJournal: 'a test toast' }));
    act(() => overlay.toast('Could not save.', { tone: 'error' }));
    view.rerender({ at: '/editing/chapter-2' });
    expect(texts(overlay)).toEqual(['Could not save.']);
  });

  it('an Undo toast raised on the page the narrator is on stays', async () => {
    const { journal, overlay, view } = setup('/proof');
    view.rerender({ at: '/proof' });
    const id = await decide(journal, 'Waive');
    act(() => overlay.toastUndo('Waive', () => journal.undo(id), { entry: id }));
    expect(texts(overlay)).toEqual(['Waive']);
  });

  it('stops listening to the journal when the shell unmounts', async () => {
    const { journal, overlay, view } = setup();
    const id = await decide(journal, 'Waive');
    view.unmount();
    act(() => overlay.toastUndo('Waive', () => journal.undo(id), { entry: id }));
    await act(async () => void (await journal.undo(id)));
    expect(texts(overlay)).toEqual(['Waive']);
  });
});
