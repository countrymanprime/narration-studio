// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { GuideEntity } from '../../../../api/contracts/storyBible';
import { scriptContextProvider, type MenuHandlers, type ReaderSelection, type ScriptMenuDeps } from './contextProvider';

const types: MarkType[] = [
  { key: 'tone', name: 'Tone', colour: 'copper', style: 'underline', asks: false },
  { key: 'query', name: 'Query', colour: 'bad', style: 'underline', asks: true },
];
const mark = (id: string, type: string, status?: 'open' | 'resolved'): Mark =>
  ({
    id,
    chapterId: 'c1',
    paragraphId: 'p1',
    paragraph: 0,
    start: 0,
    end: 3,
    quote: 'Hi',
    type,
    text: 'n',
    status,
    thread: [],
    createdAt: '',
    stale: false,
  }) as Mark;
const entry = { id: 'e1', canonical_name: 'Alice', category: 'Character', aliases: [] } as unknown as GuideEntity;
const selection: ReaderSelection = { chapterId: 'c1', paragraphId: 'p1', start: 0, end: 5, quote: 'Alice' };

afterEach(() => void (document.body.innerHTML = ''));

function build(handlers: Partial<MenuHandlers> = {}, marks: Mark[] = []) {
  const commands = {
    setMarkType: vi.fn(async () => null),
    removeMark: vi.fn(async () => null),
    setStatus: vi.fn(async () => null),
    removeWord: vi.fn(async () => null),
    flagWord: vi.fn(async () => null),
    createEntryFrom: vi.fn(async () => null),
    setPrep: vi.fn(async () => null),
  };
  const all: MenuHandlers = {
    selectionAt: () => null,
    openFind: vi.fn(),
    showMark: vi.fn(),
    showWord: vi.fn(),
    showEntry: vi.fn(),
    lookUp: vi.fn(),
    copy: vi.fn(),
    goToChapter: vi.fn(),
    composeMark: vi.fn(),
    ...handlers,
  };
  const deps: ScriptMenuDeps = {
    lists: () => ({ types, marks, entries: [entry], kinds: ['Character', 'Place'], chapters: [{ id: 'c1', title: 'One' }], prepOf: () => 'progress' }),
    commands,
    handlers: () => all,
  };
  return { provider: scriptContextProvider(deps), commands, handlers: all };
}

function dom(html: string): Element {
  document.body.innerHTML = html;
  return document.body.querySelector('[data-t]')!;
}

describe('context-provider-matches-the-targets', () => {
  it('answers for the Script’s targets and for nothing else', () => {
    const { provider } = build();
    expect(provider.match(dom('<p data-pid="p1"><span data-t>x</span></p>'))).toBe(true);
    expect(provider.match(dom('<div data-jump="c1"><b data-t>x</b></div>'))).toBe(true);
    expect(provider.match(dom('<table><tr data-w="caius"><td data-t>x</td></tr></table>'))).toBe(true);
    expect(provider.match(dom('<div data-t>elsewhere</div>'))).toBe(false);
    expect(provider.match(dom('<div data-bm="b1"><i data-t>ribbon</i></div>'))).toBe(false);
  });

  it('a selection gets the mock’s items with the types and kinds from the lists', () => {
    const { provider } = build({ selectionAt: () => selection });
    const labels = provider.items(dom('<p data-pid="p1"><span data-t>Alice</span></p>')).map((i) => i.label);
    expect(labels).toEqual([
      'Mark as: Tone',
      'Mark as: Query',
      'Mark as: Pronunciation (a word)',
      'Add to the Story Bible as: Character',
      'Add to the Story Bible as: Place',
      'Look up “Alice”',
      'Find “Alice” in the manuscript',
      'Copy',
    ]);
  });

  it('a mark gets its thread, status, type and delete items; a note has no status item', () => {
    const asked = build({}, [mark('m1', 'query', 'open')]);
    const items = asked.provider.items(dom('<p data-pid="p1"><mark data-a="m1" data-st="highlight" data-t>Hi</mark></p>'));
    expect(items.map((i) => i.label)).toEqual(['Open the thread', 'Mark resolved', 'Change type: Tone', 'Change type: Query', 'Delete mark']);
    expect(items.find((i) => i.key === 'mark-type-query')?.unavailable).toBeTruthy();
    const note = build({}, [mark('m1', 'tone')]);
    expect(note.provider.items(dom('<p data-pid="p1"><mark data-a="m1" data-st="highlight" data-t>Hi</mark></p>')).map((i) => i.label)).toEqual([
      'Edit the note',
      'Change type: Tone',
      'Change type: Query',
      'Delete mark',
    ]);
  });

  it('a resolved query offers Reopen', () => {
    const { provider } = build({}, [mark('m1', 'query', 'resolved')]);
    expect(provider.items(dom('<p data-pid="p1"><mark data-a="m1" data-st="highlight" data-t>Hi</mark></p>'))[1].label).toBe('Reopen');
  });

  it('a name gets Open in the side panel and Find; the first matching target wins over the selection', () => {
    const { provider } = build({ selectionAt: () => selection });
    const items = provider.items(dom('<p data-pid="p1"><span data-ent="e1" data-t>Alice</span></p>'));
    expect(items.slice(0, 2).map((i) => i.label)).toEqual(['Open “Alice” in the side panel', 'Find “Alice” in the manuscript']);
    expect(items.length).toBeGreaterThan(2);
  });

  it('a chapter row or boundary card gets Go to, Record in Booth, and the prep states', () => {
    const { provider } = build({ recordChapter: vi.fn() });
    const items = provider.items(dom('<div data-jump="c1"><b data-t>One</b></div>'));
    expect(items.map((i) => i.label)).toEqual(['Go to this chapter', 'Record in Booth', 'My prep: Not started', 'My prep: In progress', 'My prep: Prepped']);
    expect(items.find((i) => i.key === 'prep-progress')?.unavailable).toBeTruthy();
    expect(provider.items(dom('<section data-bound="" data-ch="c1"><b data-t>One</b></section>'))).toHaveLength(5);
  });

  it('a word of the side panel gets Show and Remove', () => {
    const { provider, commands, handlers } = build();
    const items = provider.items(dom('<table><tr data-w="caius"><td data-t>x</td></tr></table>'));
    expect(items.map((i) => i.label)).toEqual(['Show “caius”', 'Remove from my words']);
    items[0].onSelect();
    items[1].onSelect();
    expect(handlers.showWord).toHaveBeenCalledWith('caius');
    expect(commands.removeWord).toHaveBeenCalledWith('caius');
  });
});

describe('menu-items-run-the-hooks-commands', () => {
  it('each item calls a command or a handler with the target’s ids', () => {
    const mine = build({ selectionAt: () => selection }, [mark('m1', 'query', 'open')]);
    const items = mine.provider.items(dom('<p data-pid="p1"><mark data-a="m1" data-st="highlight" data-t>Hi</mark></p>'));
    const run = (key: string) => items.find((i) => i.key === key)!.onSelect();
    run('mark-open');
    run('mark-status');
    run('mark-type-tone');
    run('mark-delete');
    run('mark-as-tone');
    run('mark-as-word');
    run('bible-as-Place');
    run('look-up');
    run('find');
    run('copy');
    expect(mine.handlers.showMark).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
    expect(mine.commands.setStatus).toHaveBeenCalledWith('m1', 'resolved');
    expect(mine.commands.setMarkType).toHaveBeenCalledWith('m1', 'tone');
    expect(mine.commands.removeMark).toHaveBeenCalledWith('m1');
    expect(mine.handlers.composeMark).toHaveBeenCalledWith('tone', selection);
    expect(mine.commands.flagWord).toHaveBeenCalledWith(selection);
    expect(mine.commands.createEntryFrom).toHaveBeenCalledWith('Place', 'Alice');
    expect(mine.handlers.lookUp).toHaveBeenCalledWith('Alice', selection);
    expect(mine.handlers.openFind).toHaveBeenCalledWith('Alice');
    expect(mine.handlers.copy).toHaveBeenCalledWith('Alice');
  });

  it('Bookmark here and Record from here run the page’s handlers', () => {
    const bookmarkHere = vi.fn();
    const recordFromHere = vi.fn();
    const { provider } = build({ selectionAt: () => selection, bookmarkHere, recordFromHere });
    const items = provider.items(dom('<p data-pid="p1"><span data-t>Alice</span></p>'));
    items.find((i) => i.key === 'bookmark-here')!.onSelect();
    items.find((i) => i.key === 'record-from-here')!.onSelect();
    expect(bookmarkHere).toHaveBeenCalledWith(selection);
    expect(recordFromHere).toHaveBeenCalledWith(selection);
  });
});

describe('no-dead-menu-items', () => {
  it('leaves out Record from here, Bookmark here and Record in Booth when the page gave no handler', () => {
    const { provider } = build({ selectionAt: () => selection });
    const labels = provider.items(dom('<p data-pid="p1"><span data-t>Alice</span></p>')).map((i) => i.label);
    expect(labels).not.toContain('Record from here');
    expect(labels).not.toContain('Bookmark here');
    expect(provider.items(dom('<div data-jump="c1"><b data-t>One</b></div>')).map((i) => i.label)).not.toContain('Record in Booth');
  });

  it('no item is disabled unless the mock shows it so', () => {
    const { provider } = build({ selectionAt: () => selection });
    expect(provider.items(dom('<p data-pid="p1"><span data-t>Alice</span></p>')).filter((i) => i.unavailable)).toEqual([]);
  });
});
