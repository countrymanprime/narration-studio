// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { PickupItem, PickupList } from '../../../../api/contracts/pickups';
import { createMockApi } from '../../../../api/mockApi';
import { overlay } from '../../../../overlay/overlayService';
import { OverlayProvider } from '../../../../overlay/OverlayProvider';
import { contextItemsFor } from '../../../../registries/context';
import { StudioProvider } from '../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../types';
import { ContextMenuHost } from '../../../layout/ContextMenuHost';
import { useFlagActions } from '../../flags/flagActions';
import { summarize, type ChapterDoc } from '../../model';
import { EditingPageProvider, useEditingPage } from '../../script/EditingPageState';
import { ScriptDoc } from '../../script/ScriptDoc';
import { marksDoc } from '../../script/scriptFixtures';
import { useEditingWordMenu } from '../useEditingWordMenu';
import { buildWordMenu } from '../wordMenuRegistry';
import { scriptSpanOf } from './scriptSpan';
import { useMarkMenuSections } from './useMarkMenuSections';

const CHAPTER = 'chapter-1';
let api: NarrationApi;
let page: ReturnType<typeof useEditingPage>;
let flagActions: ReturnType<typeof useFlagActions>;
let pickups: PickupItem[];

const pickup = (id: string, script: string): PickupItem => ({
  id,
  chapterId: CHAPTER,
  paragraphId: null,
  paragraph: null,
  time: 1,
  at: null,
  type: 'misread',
  script,
  context: script,
  source: 'you',
  confidence: null,
  confReason: '',
  included: true,
  done: false,
  waiting: false,
});

beforeEach(() => {
  pickups = [];
  const list = (): PickupList => ({ pickups: [...pickups], leftOut: [] });
  api = {
    ...createMockApi(),
    pickupsList: vi.fn(() => Promise.resolve(list())),
    pickupsAdd: vi.fn((_chapter: string, _time: number, line: string) => {
      if (!pickups.some((p) => p.script === line)) pickups.push(pickup(`you:${pickups.length + 1}`, line));
      return Promise.resolve(list());
    }),
    pickupsRemove: vi.fn((id: string) => {
      pickups = pickups.filter((p) => p.id !== id);
      return Promise.resolve(list());
    }),
    marksAdd: vi.fn(createMockApi().marksAdd),
  };
  vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
  vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  overlay.getSnapshot().dialogs.forEach((d) => (d.kind === 'confirm' ? d.answer(false) : d.close()));
  vi.restoreAllMocks();
});

function Page() {
  page = useEditingPage();
  flagActions = useFlagActions();
  useEditingWordMenu();
  useMarkMenuSections(CHAPTER);
  return <ScriptDoc />;
}
const wrap = (children: ReactNode) => (
  <ApiProvider api={api}>
    <StudioProvider>
      <OverlayProvider service={overlay}>{children}</OverlayProvider>
    </StudioProvider>
  </ApiProvider>
);
const mount = (doc: ChapterDoc = marksDoc()) =>
  render(
    wrap(
      <>
        <main tabIndex={-1}>
          <ContextMenuHost>
            <EditingPageProvider doc={doc}>
              <Page />
            </EditingPageProvider>
          </ContextMenuHost>
        </main>
      </>,
    ),
  );
const word = (key: string): HTMLElement => document.querySelector<HTMLElement>(`[data-k="${key}"]`)!;
const select = (anchor: string, head: string) => act(() => page.dispatch({ type: 'select', anchor, head }));
// The menu items for a right click on `key`; the mark types arrive from the host after the first render, so wait for them.
async function itemsOn(key: string) {
  await waitFor(() => expect(contextItemsFor(word(key))?.some((i) => i.key.startsWith('mark-as-'))).toBe(true));
  return contextItemsFor(word(key))!;
}
const item = (items: Awaited<ReturnType<typeof itemsOn>>, key: string) => items.find((i) => i.key === key)!;

describe('scriptSpanOf', () => {
  it('spans the script words of one line by their offsets and counts what it leaves out', () => {
    const doc = marksDoc();
    const text = doc.paras[0].p.text;
    const span = scriptSpanOf(doc, ['p-1:1', 'p-1:2']);
    expect(span).not.toBeNull();
    expect(text.slice(span!.start, span!.end)).toBe(span!.quote);
    expect(span!.quote).toBe('was very');
    expect(span!.paragraphId).toBe('p-1');
    expect(span!.left).toBe(0);
  });

  it('leaves out an extra word and the words of other lines, and is null when no script word is selected', () => {
    const doc = marksDoc();
    const extra = doc.items.find((i) => i.kind === 'x')!;
    expect(scriptSpanOf(doc, [extra.key])).toBeNull();
    const mixed = scriptSpanOf(doc, ['p-1:0', extra.key, 'p-2:0']);
    expect(mixed!.paragraphId).toBe('p-1');
    expect(mixed!.quote).toBe('Alice');
    expect(mixed!.left).toBe(2);
  });
});

describe('mark-as-lists-the-narrators-mark-types', () => {
  it('lists the Script page kinds and marks the selected words through its command with one undo entry', async () => {
    mount();
    select('p-1:1', 'p-1:2');
    const items = await itemsOn('p-1:1');
    const types = (await api.marksList()).types;
    expect(items.filter((i) => i.key.startsWith('mark-as-')).map((i) => i.label)).toEqual(types.map((t) => `Mark as ${t.name}`));
    const first = types[0];
    await act(async () => item(items, `mark-as-${first.key}`).onSelect());
    expect(api.marksAdd).toHaveBeenCalledWith(CHAPTER, 'p-1', expect.any(Number), expect.any(Number), first.key, '');
    expect(overlay.toast).toHaveBeenCalledWith(expect.stringContaining('Marked'));
  });

  it('refuses a question kind without its text, with the Script page sentence, and marks nothing', async () => {
    mount();
    select('p-1:0', 'p-1:0');
    const items = await itemsOn('p-1:0');
    const ask = (await api.marksList()).types.find((t) => t.asks);
    if (!ask) return;
    await act(async () => item(items, `mark-as-${ask.key}`).onSelect());
    expect(api.marksAdd).not.toHaveBeenCalled();
    expect(overlay.toast).toHaveBeenCalledWith('Write the query first.', { tone: 'error' });
  });
});

describe('words-that-were-only-said-cannot-be-marked', () => {
  it('turns the kinds and Add note off with the reason when no script word is selected', async () => {
    mount();
    const extra = page.doc.items.find((i) => i.kind === 'x')!;
    select(extra.key, extra.key);
    const items = await itemsOn(extra.key);
    const marks = items.filter((i) => i.key.startsWith('mark-as-'));
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) expect(m.unavailable).toMatch(/only said/);
    expect(item(items, 'add-note').unavailable).toMatch(/only said/);
    expect(item(items, 'mark-for-pickup').unavailable).toBeUndefined();
  });

  it('marks only the script words of a mixed selection and says how many were left out', async () => {
    mount();
    const extra = page.doc.items.find((i) => i.kind === 'x')!;
    select('p-1:4', extra.key);
    const items = await itemsOn('p-1:4');
    const first = (await api.marksList()).types.find((t) => !t.asks)!;
    await act(async () => item(items, `mark-as-${first.key}`).onSelect());
    expect(api.marksAdd).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(overlay.toast).toHaveBeenCalledWith(expect.stringMatching(/1 word that was only said was left out/)));
  });
});

describe('add-note-writes-a-note-on-the-words', () => {
  const open = async () => {
    mount();
    select('p-1:1', 'p-1:2');
    const items = await itemsOn('p-1:1');
    act(() => item(items, 'add-note').onSelect());
    return screen.findByRole('dialog', { name: 'Add a note' });
  };

  it('refuses empty text, then saves one note on the words and closes', async () => {
    const dialog = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Write the note first.')).toBeTruthy();
    expect(api.marksAdd).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Check the stress.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(api.marksAdd).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.marksAdd).mock.calls[0][5]).toBe('Check the stress.');
    await waitFor(() => expect(dialog.isConnected).toBe(false));
  });

  it('changes nothing on Cancel', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.marksAdd).not.toHaveBeenCalled();
  });

  it('changes nothing on Escape', async () => {
    await open();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Note' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.marksAdd).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    await open();
    expect((await axe.run(document.body)).violations).toEqual([]);
  });
});

describe('mark-for-pickup-adds-a-pickup', () => {
  it('adds the words as a pickup for the chapter with the time, and offers Undo that removes it', async () => {
    mount();
    select('p-1:1', 'p-1:2');
    const items = await itemsOn('p-1:1');
    await act(async () => item(items, 'mark-for-pickup').onSelect());
    expect(api.pickupsAdd).toHaveBeenCalledWith(CHAPTER, page.doc.items[page.doc.index.get('p-1:1')!].t0, 'was very');
    expect(overlay.toastUndo).toHaveBeenCalledWith('Added to Pickups.', expect.any(Function));
    const undo = vi.mocked(overlay.toastUndo).mock.calls[0][1];
    await act(async () => void (await undo()));
    expect(api.pickupsRemove).toHaveBeenCalledWith('you:1');
    expect(pickups).toEqual([]);
  });

  it('says so, and offers nothing to undo, when the line is already a pickup', async () => {
    pickups = [pickup('you:9', 'Alice')];
    mount();
    select('p-1:0', 'p-1:0');
    const items = await itemsOn('p-1:0');
    await act(async () => item(items, 'mark-for-pickup').onSelect());
    expect(overlay.toastUndo).not.toHaveBeenCalled();
    expect(overlay.toast).toHaveBeenCalledWith('That line is already in Pickups.', { tone: 'error' });
  });

  it('adds a word that was only said by the line of its paragraph', async () => {
    mount();
    const extra = page.doc.items.find((i) => i.kind === 'x')!;
    select(extra.key, extra.key);
    const items = await itemsOn(extra.key);
    await act(async () => item(items, 'mark-for-pickup').onSelect());
    expect(api.pickupsAdd).toHaveBeenCalledWith(CHAPTER, expect.any(Number), page.doc.paras[0].p.text.slice(0, 60));
  });
});

describe('sections-register-with-the-word-menu', () => {
  it('puts the entries between Play selection and Copy words and removes them when the page unmounts', async () => {
    const { unmount } = mount();
    select('p-1:0', 'p-1:0');
    await itemsOn('p-1:0');
    const keys = buildWordMenu({ doc: page.doc, keys: ['p-1:0'], summary: summarize(page.doc, ['p-1:0'], [], (s) => s), play: vi.fn(), notify: vi.fn() })
      .groups.flat()
      .map((i) => i.key);
    expect(keys[0]).toBe('play-selection');
    expect(keys.at(-1)).toBe('copy-words');
    expect(keys.indexOf('add-note')).toBeGreaterThan(keys.findIndex((k) => k.startsWith('mark-as-')));
    expect(keys.indexOf('mark-for-pickup')).toBeGreaterThan(keys.indexOf('add-note'));
    unmount();
    const after = buildWordMenu({ doc: marksDoc(), keys: ['p-1:0'], summary: {} as never, play: vi.fn(), notify: vi.fn() }).groups.flat();
    expect(after.some((i) => i.key === 'add-note' || i.key === 'mark-for-pickup' || i.key.startsWith('mark-as-'))).toBe(false);
  });
});

describe('flag-card-reuses-them', () => {
  it('fills the flag card slot, and the slot adds the same pickup the menu item does', async () => {
    mount();
    await waitFor(() => expect(flagActions.markForPickup).toBeTypeOf('function'));
    await act(async () => flagActions.markForPickup!(['p-1:0']));
    expect(api.pickupsAdd).toHaveBeenCalledWith(CHAPTER, expect.any(Number), 'Alice');
    expect(pickups).toHaveLength(1);
  });
});
