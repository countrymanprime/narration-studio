// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../../../overlay/overlayService';
import { contextItemsFor } from '../../../registries/context';
import { ContextMenuHost } from '../../layout/ContextMenuHost';
import type { ChapterDoc } from '../model';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { ScriptDoc } from '../script/ScriptDoc';
import { marksDoc, notTranscribed } from '../script/scriptFixtures';
import { docFromHeard } from '../script/docFromHeard';
import { registerWordMenuSection, buildWordMenu, type WordMenuSelection } from './wordMenuRegistry';
import { useEditingWordMenu } from './useEditingWordMenu';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let page: ReturnType<typeof useEditingPage>;
function Page() {
  page = useEditingPage();
  useEditingWordMenu();
  return <ScriptDoc />;
}
const mount = (doc: ChapterDoc = marksDoc()) =>
  render(
    <main tabIndex={-1}>
      <ContextMenuHost>
        <EditingPageProvider doc={doc}>
          <Page />
        </EditingPageProvider>
      </ContextMenuHost>
    </main>,
  );
const word = (key: string): HTMLElement => document.querySelector<HTMLElement>(`[data-k="${key}"]`)!;
const rightClick = (el: Element, button = 2) => fireEvent(el, createEvent.contextMenu(el, { bubbles: true, cancelable: true, button }));
// What the host asks when the menu opens; inside `act` because opening may select the word.
const itemsOn = (key: string) => {
  let items: ReturnType<typeof contextItemsFor> = null;
  act(() => {
    items = contextItemsFor(word(key));
  });
  return items!;
};
const labels = (key: string) => itemsOn(key).map((i) => i.label);
const select = (anchor: string, head: string) => act(() => page.dispatch({ type: 'select', anchor, head }));

describe('right-click-selects-the-word-outside-the-selection', () => {
  it('selects a word outside the selection and lists its items; inside the selection it lists the selection', () => {
    mount();
    select('p-1:0', 'p-1:2');
    expect(labels('p-2:0')[0]).toBe('1 word selected');
    expect(page.selected).toEqual(['p-2:0']);
    select('p-1:0', 'p-1:2');
    expect(labels('p-1:1')[0]).toBe('3 words selected');
    expect(page.selected).toHaveLength(3);
  });
});

describe('heading-counts-the-words', () => {
  it('says 1 word and 3 words, and puts a separator only between non-empty sections', () => {
    const doc = marksDoc();
    const keys = ['p-1:0', 'p-1:1', 'p-1:2'];
    const sel = (k: string[]): WordMenuSelection => ({ doc, keys: k, summary: {} as never, play: vi.fn(), notify: vi.fn() });
    const off = [
      registerWordMenuSection({ order: 1, items: () => [{ key: 'a', label: 'A', onSelect: vi.fn() }] }),
      registerWordMenuSection({ order: 2, items: () => [] }),
      registerWordMenuSection({ order: 3, items: () => [{ key: 'c', label: 'C', onSelect: vi.fn() }] }),
    ];
    const menu = buildWordMenu(sel(keys));
    expect(menu.heading).toBe('3 words selected');
    expect(buildWordMenu(sel(['p-1:0'])).heading).toBe('1 word selected');
    expect(menu.groups.map((g) => g.map((i) => i.label))).toEqual([['A'], ['C']]);
    off.forEach((o) => o());
  });
});

describe('play-selection-is-disabled-without-audio', () => {
  it('plays the selected words from their start and is off, with a reason, when none has audio', () => {
    mount();
    const play = itemsOn('p-1:0').find((i) => i.key === 'play-selection')!;
    expect(play.unavailable).toBeUndefined();
    act(() => play.onSelect());
    expect(page.state.playT).toBe(page.doc.items[page.doc.index.get('p-1:0')!].t0);
    cleanup();
    mount(notTranscribed() && docFromHeard([{ id: 'p-1', text: 'Alice was tired.' }], notTranscribed()));
    expect(itemsOn('p-1:0').find((i) => i.key === 'play-selection')!.unavailable).toBe('Nothing has been transcribed yet.');
  });

  it('is off for words that are all cut', () => {
    const doc = marksDoc({ cuts: [{ id: 'c1', a: 0, b: 0.1, mode: 'gap', keys: ['p-2:1'], off0: 0, off1: 0.1 }], effects: [] });
    mount(doc);
    expect(itemsOn('p-2:1').find((i) => i.key === 'play-selection')!.unavailable).toBe('There is no audio for these words.');
  });
});

describe('copy-words-copies-the-script-text', () => {
  it('copies the words in order, as said for an extra word, and says so in a toast', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const toast = vi.spyOn(overlay, 'toast');
    mount();
    select('p-1:4', 'p-1:6');
    const expected = page.selected.map((k) => page.doc.items[page.doc.index.get(k)!].text).join(' ');
    await act(async () =>
      itemsOn('p-1:5')
        .find((i) => i.key === 'copy-words')!
        .onSelect(),
    );
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(toast).toHaveBeenCalledWith(`Copied ${page.selected.length} words.`);
    const x = page.doc.items.find((i) => i.kind === 'x')!;
    select('p-2:0', 'p-2:0');
    await act(async () =>
      itemsOn(x.key)
        .find((i) => i.key === 'copy-words')!
        .onSelect(),
    );
    expect(writeText).toHaveBeenLastCalledWith(x.text);
  });
});

describe('sections-register-and-unregister', () => {
  const doc = marksDoc();
  const sel: WordMenuSelection = { doc, keys: ['p-1:0'], summary: {} as never, play: vi.fn(), notify: vi.fn() };
  const sec = (order: number, label: string) => registerWordMenuSection({ order, items: () => [{ key: label, label, onSelect: vi.fn() }] });
  const flat = () =>
    buildWordMenu(sel)
      .groups.flat()
      .map((i) => i.label);

  it('orders by order, keeps registration order for ties, and removes with the returned function', () => {
    const off = [sec(5, 'late'), sec(1, 'early'), sec(5, 'late2'), sec(1, 'early2')];
    expect(flat()).toEqual(['early', 'early2', 'late', 'late2']);
    off[0]();
    expect(flat()).toEqual(['early', 'early2', 'late2']);
    off.forEach((o) => o());
    expect(flat()).toEqual([]);
  });

  it('drops a section that throws, logs it, and keeps the rest', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const off = [
      registerWordMenuSection({
        order: 1,
        items: () => {
          throw new Error('boom');
        },
      }),
      sec(2, 'ok'),
    ];
    expect(flat()).toEqual(['ok']);
    expect(log).toHaveBeenCalled();
    off.forEach((o) => o());
  });
});

describe('one-provider-for-the-page', () => {
  it('registers while mounted, none after, and matches only the script words', () => {
    const outside = document.createElement('p');
    const { unmount } = mount();
    expect(contextItemsFor(word('p-1:0'))).not.toBeNull();
    expect(contextItemsFor(outside)).toBeNull();
    expect(contextItemsFor(document.querySelector('[data-script]')!)).toBeNull();
    unmount();
    expect(contextItemsFor(word('p-1:0') ?? outside)).toBeNull();
  });
});

describe('keyboard-and-pointer-give-the-same-items', () => {
  it('opens the same menu from the focused script as from a right click on the cursor word', async () => {
    mount();
    fireEvent.mouseDown(word('p-1:1'), { button: 0 });
    const script = document.querySelector<HTMLElement>('[data-script]')!;
    script.focus();
    rightClick(script, 0);
    const fromKeyboard = (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
    cleanup();
    mount();
    fireEvent.mouseDown(word('p-1:1'), { button: 0 });
    rightClick(word('p-1:1'));
    const fromPointer = (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
    expect(fromKeyboard).toEqual(fromPointer);
    expect(fromPointer[0]).toContain('1 word selected');
  });
});

describe('axe-and-aria', () => {
  it('has no axe violations with the menu open and a disabled reason shown', async () => {
    mount(docFromHeard([{ id: 'p-1', text: 'Alice was tired.' }], notTranscribed()));
    rightClick(word('p-1:0'));
    await screen.findAllByRole('menuitem');
    const results = await axe.run(document.body);
    expect(results.violations).toEqual([]);
  });
});
