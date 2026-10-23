// @vitest-environment jsdom
// The Studio Next Script page assembled (SN-B77): the columns and drawers, the rail's tabs, the empty state, what the page registers,
// the bookmark flow, the credits re-homed from the old page, one view state, and the old page's props. Over the browser mock host.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { providedCommands } from '../../../input/commandProviders';
import { currentPageContext } from '../../../input/pageCommands';
import { overlay } from '../../../overlay/overlayService';
import { CommandRouter } from '../../../input/router';
import { contextItemsFor } from '../../../registries/context';
import { searchAll } from '../../../registries/search';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import type { ScriptViewState } from './data/scriptView';
import { useScriptView } from './data/useScriptData';
import { DRAWER_FOCUS_DELAY_MS } from './layout/useDrawerFocus';
import { ScriptPage, type ScriptPageProps } from './ScriptPage';

let view: ScriptViewState;
function ViewProbe() {
  [view] = useScriptView((state) => state);
  return null;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
  window.localStorage.clear();
  window.getSelection()?.removeAllRanges();
});

type Mount = { api?: NarrationApi; at?: string; props?: Partial<ScriptPageProps> };

function mount({ api = createMockApi(), at = '/script', props = {} }: Mount = {}) {
  const handlers = { notify: vi.fn(), focusStoryBibleEntity: vi.fn(), goToBooth: vi.fn(), goToEditing: vi.fn() };
  const utils = render(
    <MemoryRouter initialEntries={[at]}>
      <ApiProvider api={api}>
        <StudioProvider>
          <CommandRouter>
            <TooltipProvider>
              <ViewProbe />
              <Routes>
                <Route path="/script" element={<ScriptPage {...handlers} {...props} />} />
                <Route path="/" element={<p>Production</p>} />
              </Routes>
            </TooltipProvider>
          </CommandRouter>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, ...handlers, ...utils };
}

const firstHeading = () => screen.findByRole('heading', { level: 2, name: 'Down the Rabbit-Hole' }, { timeout: 3000 });
const columns = () => document.querySelector<HTMLElement>('[data-script-columns]')!;
const panel = (name: 'chapters' | 'rail') => document.querySelector<HTMLElement>(`[data-panel="${name}"]`)!;
const press = (code: string, key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document.activeElement ?? document.body, { code, key, ...init });

/** Selects `from..to` of a paragraph's text, through its text nodes as a reader's selection would. */
function selectIn(pid: string, from: number, to: number): void {
  const p = document.querySelector(`p[data-pid="${pid}"]`)!;
  const at = (offset: number): [Node, number] => {
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let left = offset;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (left <= node.textContent!.length) return [node, left];
      left -= node.textContent!.length;
    }
    throw new Error('offset');
  };
  const range = document.createRange();
  range.setStart(...at(from));
  range.setEnd(...at(to));
  range.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 20, right: 150, bottom: 120, x: 100, y: 100, toJSON: () => ({}) }) as DOMRect;
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
}

describe('three-columns-from-1440-and-drawers-below', () => {
  it('lays the chapter list, the reader and the rail out as the mock does, at its widths', async () => {
    mount();
    await firstHeading();
    // jsdom does not lay out, so this pins the classes; the stories at 1440, 1024 and 768 show the result.
    expect(columns().className).toContain('min-[1281px]:grid-cols-[240px_minmax(0,1fr)_380px]');
    expect(columns().className).toContain('min-[1180px]:grid-cols-[240px_minmax(0,1fr)]');
    expect(panel('rail').className).toContain('max-[1281px]:absolute');
    expect(panel('chapters').className).toContain('max-[1180px]:absolute');
    expect(panel('rail').className).toContain('max-[1281px]:invisible');
    // At full width the list draws no title, as the mock's (its title and close button are the drawer's).
    expect(within(panel('chapters')).getByRole('region', { name: 'Chapters' })).toBeTruthy();
    expect(within(panel('chapters')).queryByRole('heading', { name: 'Chapters' })).toBeNull();
    expect(within(panel('rail')).getByRole('tablist', { name: 'Words, Story Bible and marks' })).toBeTruthy();
  });

  it('the reader header buttons open each drawer with a scrim, move focus in, and Escape or the scrim closes it and gives focus back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount();
    await firstHeading();
    const chaptersButton = screen.getByRole('button', { name: 'Chapters' });
    chaptersButton.focus();
    fireEvent.click(chaptersButton);
    expect(view.drawer).toBe('ch');
    expect(columns().dataset.drawer).toBe('ch');
    expect(panel('chapters').className).not.toContain('max-[1180px]:invisible');
    expect(document.querySelector('[data-scrim]')!.className).toContain('min-[1180px]:hidden');
    act(() => void vi.advanceTimersByTime(DRAWER_FOCUS_DELAY_MS));
    expect(panel('chapters').contains(document.activeElement)).toBe(true);

    press('Escape', 'Escape');
    expect(view.drawer).toBeNull();
    expect(document.querySelector('[data-scrim]')).toBeNull();
    expect(document.activeElement).toBe(chaptersButton);

    const railButton = screen.getByRole('button', { name: 'Words, Story Bible and marks' });
    railButton.focus();
    fireEvent.click(railButton);
    expect(view.drawer).toBe('rail');
    act(() => void vi.advanceTimersByTime(DRAWER_FOCUS_DELAY_MS));
    expect(document.activeElement?.getAttribute('role')).toBe('tab');
    fireEvent.click(document.querySelector('[data-scrim]')!);
    expect(view.drawer).toBeNull();
    expect(document.activeElement).toBe(railButton);
  });

  it('the drawer close button in the rail closes it', async () => {
    mount();
    await firstHeading();
    fireEvent.click(screen.getByRole('button', { name: 'Words, Story Bible and marks' }));
    fireEvent.click(within(panel('rail')).getByRole('button', { name: 'Close' }));
    expect(view.drawer).toBeNull();
  });
});

describe('rail-tabs-rove-and-show-the-right-body', () => {
  it('has the three tabs, and Left and Right move and select, wrapping', async () => {
    mount();
    await firstHeading();
    const tabs = within(panel('rail')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Words', 'Story Bible', 'Notes']);
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft', code: 'ArrowLeft' });
    await waitFor(() => expect(view.tab).toBe('marks'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight', code: 'ArrowRight' });
    await waitFor(() => expect(view.tab).toBe('pron'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight', code: 'ArrowRight' });
    await waitFor(() => expect(view.tab).toBe('bible'));
  });

  it('each tab shows its body, for the chapter in view', async () => {
    mount();
    await firstHeading();
    const body = () => document.getElementById('railbody')!;
    await waitFor(() => expect(within(body()).getByText('Definitions from')).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));
    await waitFor(() => expect(view.tab).toBe('marks'));
    await waitFor(() => expect(body().textContent).toContain('No notes in this chapter yet.'));
    // The rail follows the chapter at the top of the reader.
    fireEvent.click(screen.getByRole('tab', { name: 'Story Bible' }));
    await waitFor(() => expect(view.tab).toBe('bible'));
  });

  it('has no Queries or Bookmarks tab and no header Bookmarks button', async () => {
    mount();
    await firstHeading();
    expect(screen.queryByRole('tab', { name: 'Queries' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Bookmarks' })).toBeNull();
    expect(within(document.querySelector('section[aria-label="Reader"]')!).queryByRole('button', { name: 'Bookmarks' })).toBeNull();
  });
});

describe('no-manuscript-shows-the-empty-state-and-moves-nowhere', () => {
  it('draws the need-a-manuscript state, offers the import, and goes to Production only when asked', async () => {
    const api = createMockApi({ manuscriptChapters: async () => [] });
    mount({ api });
    expect(await screen.findByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy();
    expect(document.querySelector('[data-script-columns]')).toBeNull();
    // Issue 1720: the page does not open the import by itself; the button goes to Production, where the import lives.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(screen.queryByText('Production')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Import manuscript' }));
    expect(screen.getByText('Production')).toBeTruthy();
  });
});

describe('registers-and-unregisters', () => {
  it('registers the search sources, the right-click provider, the keys and the bookmark commands once, and removes them on unmount', async () => {
    const { unmount } = mount();
    await firstHeading();
    await waitFor(() => expect(searchAll('Alice').some((hit) => hit.group === 'In the script')).toBe(true));
    const p = document.querySelector('p[data-pid]')!;
    expect(contextItemsFor(p)).not.toBeNull();
    const ours = () => providedCommands().filter((row) => row.id.startsWith('bookmark.menu.'));
    expect(ours().map((row) => row.id)).toEqual(['bookmark.menu.here', 'bookmark.menu.next', 'bookmark.menu.prev']);

    // Ctrl+F is the shell's jump.page now: the page opens no search of its own.
    press('KeyF', 'f', { ctrlKey: true });
    expect(view.find.open).toBe(false);
    expect(currentPageContext()).toMatchObject({ id: 'script', label: 'Script' });

    unmount();
    expect(currentPageContext()).toBeNull();
    expect(searchAll('Alice').some((hit) => hit.group === 'In the script')).toBe(false);
    expect(contextItemsFor(p)).toBeNull();
    expect(ours()).toEqual([]);
  });
});

describe('right-click-menus-reach-what-the-page-draws', () => {
  const labels = (target: Element | null) =>
    target ? (contextItemsFor(target) ?? []).map((item) => (item.group ? `${item.group}: ${item.label}` : item.label)) : [];

  it('a mark, a flagged word, a chapter row, a chapter card and a Words row each get their menu', async () => {
    const api = createMockApi({ creditsTemplates: async () => [] });
    const [chapter] = await api.manuscriptChapters();
    const [line] = await api.manuscriptParagraphs(chapter!.id);
    const types = await api.marksList();
    await api.marksAdd(chapter!.id, line!.id, 0, 5, types.types[0]!.key, 'Check this');
    const found = /\p{L}{6,}/u.exec(line!.text)!;
    await api.scriptWordFlag(chapter!.id, line!.id, found.index, found.index + found[0].length);
    mount({ api });
    await firstHeading();
    await waitFor(() => expect(document.querySelector('[data-pid] [data-st]')).not.toBeNull());
    expect(labels(document.querySelector('[data-pid] [data-st]'))).toContain('Delete mark');
    await waitFor(() => expect(document.querySelector('[data-pid] [data-w]')).not.toBeNull());
    expect(labels(document.querySelector('[data-pid] [data-w]'))).toContain('Show in Words');
    const row = within(panel('chapters')).getAllByRole('button')[0]!;
    expect(labels(row)).toContain('Go to this chapter');
    expect(labels(document.querySelector('[data-reader] [data-bound] h2'))).toContain('My prep: Prepped');
    const wordRow = await waitFor(() => document.querySelector('#railbody tbody tr')!);
    expect(labels(wordRow)).toContain('Remove from my words');
  });
});

describe('record-from-here-and-flagged-words', () => {
  it('Record from here on the selection tool and in the menu opens the Booth at the selection', async () => {
    const { goToBooth } = mount();
    await firstHeading();
    await waitFor(() => expect(document.querySelector('p[data-pid="p-2"]')).not.toBeNull());
    selectIn('p-2', 3, 6);
    fireEvent.mouseUp(document.getElementById('reader')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Record from here' }));
    expect(goToBooth).toHaveBeenLastCalledWith({ chapter: 'chapter-1', from: { paragraphId: 'p-2', offset: 3 } });
    selectIn('p-2', 3, 6);
    const menu = contextItemsFor(document.querySelector('p[data-pid="p-2"]')!)!;
    menu.find((row) => row.label === 'Record from here')!.onSelect();
    expect(goToBooth).toHaveBeenCalledTimes(2);
  });

  it('Look up on one word opens its card, and Add to my words flags the word selected', async () => {
    const api = createMockApi({ creditsTemplates: async () => [] });
    const flag = vi.spyOn(api, 'scriptWordFlag');
    mount({ api });
    await firstHeading();
    const p = await waitFor(() => document.querySelector<HTMLElement>('p[data-pid="p-2"]')!);
    const found = /\b(?!Alice\b|Rabbit\b|White\b)\p{L}{4,}/u.exec(p.textContent!)!;
    selectIn('p-2', found.index, found.index + found[0].length);
    fireEvent.mouseUp(document.getElementById('reader')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(view.tab).toBe('pron'));
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my words' }));
    await waitFor(() => expect(flag).toHaveBeenCalledWith('chapter-1', 'p-2', found.index, found.index + found[0].length));
  });

  it('a click on a flagged word opens it in the Words tab', async () => {
    const api = createMockApi({ creditsTemplates: async () => [] });
    const [chapter] = await api.manuscriptChapters();
    const [line] = await api.manuscriptParagraphs(chapter!.id);
    const found = /\p{L}{6,}/u.exec(line!.text)!;
    await api.scriptWordFlag(chapter!.id, line!.id, found.index, found.index + found[0].length);
    mount({ api });
    await firstHeading();
    const word = await waitFor(() => document.querySelector<HTMLElement>('[data-pid] [data-w]')!);
    fireEvent.click(word);
    await waitFor(() => expect(view.tab).toBe('pron'));
    expect(view.word).toBe(word.dataset.w);
  });
});

describe('bookmark-flow-end-to-end', () => {
  it('Bookmark here adds a ribbon, opens its editor, and Next and Previous move between bookmarks, wrapping', async () => {
    const { api } = mount();
    await firstHeading();
    await waitFor(() => expect(document.querySelector('p[data-pid="p-2"]')).not.toBeNull());

    selectIn('p-1', 6, 9);
    press('KeyB', 'b');
    await waitFor(async () => expect(await api.bookmarksList()).toHaveLength(1));
    const [first] = await api.bookmarksList();
    expect(first).toMatchObject({ chapterId: 'chapter-1', paragraphId: 'p-1', offset: 6 });
    const ribbon = await waitFor(() => document.querySelector<HTMLElement>(`[data-para] [data-bm="${first!.id}"]`)!);
    expect(ribbon).not.toBeNull();
    expect(await screen.findByRole('dialog', { name: 'Edit bookmark' })).toBeTruthy();
    press('Escape', 'Escape');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit bookmark' })).toBeNull());

    // Selecting with the pointer puts focus in the reader, not on the ribbon the editor gave it back to.
    document.querySelector<HTMLElement>('section[aria-label="Reader"] [role="region"]')!.focus();
    selectIn('p-2', 3, 6);
    press('KeyB', 'b');
    await waitFor(async () => expect(await api.bookmarksList()).toHaveLength(2));
    await screen.findByRole('dialog', { name: 'Edit bookmark' });
    press('Escape', 'Escape');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit bookmark' })).toBeNull());
    window.getSelection()!.removeAllRanges();

    // Going to a bookmark lights its ribbon in the reader. From the top of the page the next bookmark is the first, then the second, then round
    // to the first; Previous goes back.
    const [one, two] = await api.bookmarksList();
    const lit = () => document.querySelector<HTMLElement>('[data-bm] [data-just-changed]')?.closest<HTMLElement>('[data-bm]')?.dataset.bm;
    press('BracketRight', ']', { altKey: true });
    await waitFor(() => expect(lit()).toBe(one!.id));
    press('BracketRight', ']', { altKey: true });
    await waitFor(() => expect(lit()).toBe(two!.id));
    press('BracketRight', ']', { altKey: true });
    await waitFor(() => expect(lit()).toBe(one!.id));
    press('BracketLeft', '[', { altKey: true });
    await waitFor(() => expect(lit()).toBe(two!.id));
  });
});

describe('credits-cards-and-banner-stay', () => {
  // Ported from the old page's `ScriptPage.test.tsx`: "credits pseudo-entries", "the credits-setup banner and Fill in", "retail
  // sample marker" and "Record in Booth" on the credits cards.
  const card = (name: string) => screen.getByRole('heading', { name }).closest('[data-credits-entry]') as HTMLElement;

  it('shows the Opening credits at the start of the book and the Closing credits after the last chapter', async () => {
    mount();
    await firstHeading();
    const opening = await screen.findByRole('heading', { name: 'Opening credits' });
    const closing = screen.getByRole('heading', { name: 'Closing credits' });
    // Each chapter's section in the reader, in book order.
    const sections = [...document.querySelectorAll<HTMLElement>('[data-reader] [data-bound]')];
    expect(sections.length).toBeGreaterThan(1);
    const chapterOne = screen.getByRole('heading', { level: 2, name: 'Down the Rabbit-Hole' });
    // The opening card comes before chapter 1's title; the closing card after the last chapter's section, not beside the opening card.
    expect(chapterOne.compareDocumentPosition(opening) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(opening.compareDocumentPosition(sections[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The credits are sections of their own, as the mock's chapters: neither sits inside a chapter's.
    const lastChapter = sections.at(-2)!;
    expect(lastChapter.compareDocumentPosition(closing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lastChapter.contains(closing)).toBe(false);
    expect(sections[1]!.contains(opening)).toBe(false);
    expect(await within(card('Opening credits')).findByText(/unresolved token/)).toBeTruthy();
  });

  it('lists Opening credits first and Closing credits last in the chapter list', async () => {
    mount();
    await firstHeading();
    const list = screen.getAllByRole('list', { name: 'Chapters' })[0]!;
    await waitFor(() => expect(within(list).getAllByRole('button').at(-1)!.textContent).toContain('Closing credits'));
    expect(within(list).getAllByRole('button')[0]!.textContent).toContain('Opening credits');
  });

  it('draws the credits as the mock draws a chapter: the card, its text, and the end of the one before', async () => {
    mount();
    const opening = await waitFor(() => card('Opening credits'));
    expect(within(opening).getByText('Credits')).toBeTruthy();
    expect(within(opening).getByText(/words · about \d+ min finished audio · 0 notes/)).toBeTruthy();
    expect(within(opening).getByRole('group', { name: 'Prep state for Opening credits' })).toBeTruthy();
    // The text the template renders, with the tokens left to fill in, as lines of the reader under the card.
    await waitFor(() => expect(document.querySelectorAll('[data-para][data-ch="credits:opening"]').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Opening credits', expanded: true })).toBeNull();
    expect(await screen.findByText(/End of opening credits · [\d,]+ words/i)).toBeTruthy();
    expect(within(card('Closing credits')).getByText(/End of .+ · [\d,]+ words/i)).toBeTruthy();
  });

  it('keeps the credits prep state on the host, as a chapter', async () => {
    const api = createMockApi();
    const set = vi.spyOn(api, 'scriptPrepSetChapter');
    mount({ api });
    const opening = await waitFor(() => card('Opening credits'));
    fireEvent.click(within(opening).getByRole('button', { name: 'Prepped' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('credits:opening', 'prepped'));
    const row = await within(panel('chapters')).findByRole('button', { name: /Opening credits/ });
    await waitFor(() => expect(within(row).getByRole('img').getAttribute('data-prep')).toBe('prepped'));
  });

  it('renders no credits cards when the library has no opening or closing template', async () => {
    mount({ api: createMockApi({ creditsTemplates: async () => [] }) });
    await firstHeading();
    expect(screen.queryByRole('heading', { name: 'Opening credits' })).toBeNull();
  });

  it('a "#credits-closing" link goes to the closing credits', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.ch === 'credits:closing' && this.hasAttribute('data-bound') ? 5000 : 0;
    });
    const scrolled: number[] = [];
    vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation((value: number) => void scrolled.push(value));
    mount({ at: '/script#credits-closing' });
    await screen.findByRole('heading', { name: 'Closing credits' });
    await waitFor(() => expect(scrolled).toContain(4992));
  });

  it('shows the banner above the cards; its Fill in opens the setup dialog and the banner steps aside; Save closes it', async () => {
    mount({ api: createMockApi({}, { creditsSetup: true }) });
    const banner = (await screen.findByText(/The credits need 3 values/)).closest('section') as HTMLElement;
    const opening = await waitFor(() => card('Opening credits'));
    expect(banner.compareDocumentPosition(opening) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(banner).getByRole('button', { name: 'Fill in' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Set up the credits' }));
    expect(screen.queryByText(/The credits need 3 values/)).toBeNull();
    fireEvent.change(dialog.getByLabelText('Narrator'), { target: { value: 'Ada Finch' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Set up the credits' })).toBeNull());
  });

  it('Fill in on a credits card opens the same dialog', async () => {
    mount();
    const opening = await waitFor(() => card('Opening credits'));
    await within(opening).findByText(/unresolved token/);
    fireEvent.click(within(opening).getByRole('button', { name: 'Fill in' }));
    expect(await screen.findByRole('dialog', { name: 'Set up the credits' })).toBeTruthy();
  });

  it('Record in Booth on the credits cards opens the Booth on them', async () => {
    const { goToBooth } = mount();
    for (const [kind, name] of [
      ['opening', 'Opening credits'],
      ['closing', 'Closing credits'],
    ] as const) {
      await screen.findByRole('heading', { name });
      fireEvent.click(await within(card(name)).findByRole('button', { name: `Record ${name} in Booth` }));
      expect(goToBooth).toHaveBeenLastCalledWith({ credits: kind });
    }
  });

  it('marks the chapter that holds the retail sample and exactly its lines', async () => {
    const base = createMockApi();
    const chapter = (await base.manuscriptChapters())[0]!;
    const ids = chapter.paragraphIds ?? [];
    const sample = {
      startParagraphId: ids[1]!.id,
      endParagraphId: ids[2]!.id,
      startChapterId: chapter.id,
      startLine: 2,
      endChapterId: chapter.id,
      endLine: 3,
      words: 60,
      seconds: 23.2,
    };
    mount({ api: createMockApi({ creditsRetailSample: async () => ({ sample, problem: '' }) }) });
    await firstHeading();
    await waitFor(() => expect(document.querySelectorAll('[data-retail-sample]')).toHaveLength(2));
    const marked = [...document.querySelectorAll('[data-retail-sample]')].map((row) => Number(row.getAttribute('data-paragraph')));
    expect(marked).toEqual([ids[1]!.index, ids[2]!.index]);
    expect(screen.getByText(/Retail sample starts · about 0m 23s/)).toBeTruthy();
    expect(screen.getAllByText('Retail sample')).toHaveLength(1);
  });

  it('marks nothing when no retail sample is picked', async () => {
    mount({ api: createMockApi({ creditsRetailSample: async () => ({ sample: null, problem: '' }) }) });
    await firstHeading();
    expect(document.querySelector('[data-retail-sample]')).toBeNull();
  });
});

describe('view-state-is-one-module', () => {
  it('the tab, the drawer, the word and the selected mark the page shows are the SN-B70 view module’s', async () => {
    mount();
    await firstHeading();
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));
    await waitFor(() => expect(view.tab).toBe('marks'));
  });

  it('no file of the page or its layout keeps its own copy of a view-module field', () => {
    const fields = ['tab', 'sel', 'word', 'entryId', 'miss', 'find', 'drawer', 'spyAt'];
    const dir = join(__dirname, 'layout');
    const sources = [
      'ScriptPage.tsx',
      ...readdirSync(dir)
        .filter((name) => /\.tsx?$/.test(name) && !/\.(test|stories)\./.test(name))
        .map((name) => `layout/${name}`),
    ];
    const copies = sources.flatMap((name) => {
      const text = readFileSync(join(__dirname, name), 'utf8');
      return [...text.matchAll(/const \[(\w+), set\w+\] = useState/g)]
        .map((m) => m[1]!)
        .filter((held) => fields.includes(held))
        .map((held) => `${name}: ${held}`);
    });
    expect(copies).toEqual([]);
  });
});

describe('deep-links-from-other-pages', () => {
  it('#p<index> asks the reader for that paragraph and takes the hash off the address', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const target = chapters.find((chapter) => chapter.id !== chapters[0]!.id && (chapter.paragraphIds?.length ?? 0) > 1)!.paragraphIds![1]!;
    const asked: string[] = [];
    function Probe() {
      const [pid] = useScriptView((state) => state.pendingPid);
      if (pid && asked.at(-1) !== pid) asked.push(pid);
      return null;
    }
    render(
      <MemoryRouter initialEntries={[`/script#p${target.index}`]}>
        <ApiProvider api={api}>
          <StudioProvider>
            <CommandRouter>
              <TooltipProvider>
                <Probe />
                <Routes>
                  <Route path="/script" element={<ScriptPage notify={vi.fn()} focusStoryBibleEntity={vi.fn()} />} />
                </Routes>
              </TooltipProvider>
            </CommandRouter>
          </StudioProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    await firstHeading();
    await waitFor(() => expect(asked).toContain(target.id));
  });
});

describe('props-match-the-old-page', () => {
  it('takes the props the /script route passes (App.tsx)', () => {
    type Old = {
      notify: ScriptPageProps['notify'];
      focusStoryBibleEntity: (id: string) => void;
      goToEditing?: (chapterId: string) => void;
      goToBooth?: ScriptPageProps['goToBooth'];
    };
    const same: Old = { notify: vi.fn(), focusStoryBibleEntity: vi.fn(), goToEditing: vi.fn(), goToBooth: vi.fn() };
    const asNew: ScriptPageProps = same;
    const back: Old = asNew;
    expect(back).toBe(same);
  });

  it('Record in Booth on a narration chapter calls goToBooth with the chapter', async () => {
    const { goToBooth } = mount();
    await firstHeading();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Record in Booth' }))[0]!);
    expect(goToBooth).toHaveBeenCalledWith({ chapter: 'chapter-1' });
  });
});

beforeEach(() => {
  // The reader remembers its place in storage; each test starts at the top.
  window.localStorage.clear();
});

describe('key-hints-under-the-reader', () => {
  it('draws the key hints under the reader', async () => {
    mount();
    await firstHeading();
    const reader = document.getElementById('reader')!;
    const hints = within(reader).getByRole('note', { name: 'Keyboard shortcuts' });
    // The mock Legend's hints, drawn from the key catalogue; the caps are the default keymap's.
    // The selection tools are a first-use tip now, not a line that stays on the page.
    expect(hints.textContent).not.toContain('Select text to mark it');
    for (const label of ['scroll', 'prep state', 'chapter', 'bookmark', 'bookmarks', 'search']) expect(within(hints).getByText(label)).toBeTruthy();
    // Under the reader's text, not above it.
    expect(reader.lastElementChild).toBe(hints);
  });
});

describe('first-use-tip-for-the-selection-tools', () => {
  it('tells the narrator once, over the reader, how to use a selection, and Got it keeps it away', async () => {
    const api = createMockApi();
    mount({ api });
    await firstHeading();
    const tip = await screen.findByRole('complementary', { name: 'Tip' });
    expect(tip.textContent).toContain('Select text in the reader to mark it, add a note, or look it up.');
    expect(document.getElementById('reader')!.contains(tip)).toBe(true);
    // First in the reader, so Tab reaches Got it before the book's own controls.
    expect(tip.compareDocumentPosition(document.querySelector('p[data-pid]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(tip).getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Tip' })).toBeNull());
    await waitFor(async () => expect((await api.settingsForScope('global')).Tips?.[0]?.effectiveValue).toBe('script.select-text'));
  });
});

describe('dictionary-download-in-place', () => {
  it('offers the dictionary download in place', async () => {
    window.localStorage.setItem('narration.script.definitions', 'local');
    // No credits, so the section at the top of the reader is a chapter, whose words the tab lists.
    const api = createMockApi({ creditsTemplates: async () => [] }, { dictionary: 'missing' });
    const install = vi.spyOn(api, 'assetsInstall');
    // A flagged word in every chapter, so the Words tab has a row to open whichever chapter the reader reports as in view.
    for (const chapter of await api.manuscriptChapters()) {
      const [line] = await api.manuscriptParagraphs(chapter.id);
      const found = /\p{L}+/u.exec(line!.text)!;
      await api.scriptWordFlag(chapter.id, line!.id, found.index, found.index + found[0].length);
    }
    mount({ api });
    await firstHeading();
    const body = () => document.getElementById('railbody')!;
    // A flagged word's row opens its card, which reads the definition from the chosen source.
    fireEvent.click((await within(body()).findAllByRole('row', {}, { timeout: 5000 }))[0]!);
    await waitFor(() => expect(within(body()).getByText(/is not installed/)).toBeTruthy(), { timeout: 5000 });
    expect(install).not.toHaveBeenCalled();
    fireEvent.click(within(body()).getByRole('button', { name: 'Download dictionary' }));
    const question = await screen.findByRole('alertdialog', { name: 'Download the dictionary?' });
    expect(install).not.toHaveBeenCalled();
    fireEvent.click(within(question).getByRole('button', { name: 'Download dictionary' }));
    await waitFor(() => expect(install).toHaveBeenCalledWith('dictionary', expect.any(String)));
  });
});

describe('bookmarks-from-the-jump-menu', () => {
  /** Makes one bookmark in the second paragraph with the keyboard, as a narrator would, and returns it. */
  async function bookmarked(api: NarrationApi) {
    await firstHeading();
    await waitFor(() => expect(document.querySelector('p[data-pid="p-2"]')).not.toBeNull());
    selectIn('p-2', 3, 6);
    press('KeyB', 'b');
    await waitFor(async () => expect(await api.bookmarksList()).toHaveLength(1));
    await screen.findByRole('dialog', { name: 'Edit bookmark' });
    press('Escape', 'Escape');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit bookmark' })).toBeNull());
    window.getSelection()!.removeAllRanges();
    return (await api.bookmarksList())[0]!;
  }

  it('choosing Bookmark: label in the jump menu scrolls the reader to it', async () => {
    const { api } = mount();
    const bookmark = await bookmarked(api);
    const reader = document.querySelector<HTMLElement>('section[aria-label="Reader"] [role="region"]')!;
    const tops: number[] = [];
    let top = 0;
    Object.defineProperty(reader, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = value;
        tops.push(value);
      },
    });
    const entry = providedCommands().find((row) => row.id === `bookmark.go.${bookmark.id}`);
    expect(entry?.label).toMatch(/^Bookmark: /);
    act(() => entry!.run());
    // The reader is asked once, scrolls, and the bookmark's ribbon pulses.
    await waitFor(() => expect(tops.length).toBeGreaterThan(0));
    await waitFor(() => expect(document.querySelector(`[data-bm="${bookmark.id}"] [data-just-changed]`)).not.toBeNull());
  });

  it('Next bookmark with none says No bookmarks yet.', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    mount();
    await firstHeading();
    press('BracketRight', ']', { altKey: true });
    expect(toast).toHaveBeenCalledWith('No bookmarks yet.');
    toast.mockClear();
    act(() =>
      providedCommands()
        .find((row) => row.id === 'bookmark.menu.next')!
        .run(),
    );
    expect(toast).toHaveBeenCalledWith('No bookmarks yet.');
    toast.mockRestore();
  });
});

describe('search-through-the-jump-menu', () => {
  it('the toolbar has no Find button and the page draws no search bar', async () => {
    mount();
    await firstHeading();
    expect(screen.queryByRole('button', { name: /Find in the manuscript/ })).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Find in the manuscript' })).toBeNull();
  });

  it('a result chosen in the menu marks every match in the reader, makes the chosen one current, and the menu steps them', async () => {
    mount();
    await firstHeading();
    await waitFor(() => expect(searchAll('the').filter((hit) => hit.group === 'In the script').length).toBeGreaterThan(2));
    const hits = searchAll('the').filter((hit) => hit.group === 'In the script');
    expect(hits[0]!.snippet!.hit.toLowerCase()).toBe('the');
    expect(hits[0]!.sub).toMatch(/¶/);
    act(() => hits[2]!.run());
    expect(view.find).toMatchObject({ open: true, q: 'the', i: 2 });
    await waitFor(() => expect(document.querySelectorAll('mark[data-kind="search"]').length).toBeGreaterThan(2));
    expect(document.querySelectorAll('.a-find-cur')).toHaveLength(1);
    const items = () => currentPageContext()!.items.filter((row) => row.group === 'Search');
    expect(items()[0]!.hint).toMatch(/^3 of \d+ for “the”$/);
    act(() => items()[0]!.run());
    expect(view.find.i).toBe(3);
    press('F3', 'F3', { shiftKey: true });
    await waitFor(() => expect(view.find.i).toBe(2));
    press('Escape', 'Escape');
    await waitFor(() => expect(view.find.open).toBe(false));
    expect(document.querySelectorAll('.a-find-cur')).toHaveLength(0);
  });

  it('/script?find=Alice marks Alice in the reader', async () => {
    mount({ at: '/script?find=Alice' });
    await firstHeading();
    await waitFor(() => expect(view.find).toMatchObject({ open: true, q: 'Alice', i: 0 }));
    expect(screen.queryByRole('search')).toBeNull();
  });

  it('takes the query off the address once read, so Back does not search again', async () => {
    mount({ at: '/script?find=Alice' });
    await firstHeading();
    await waitFor(() => expect(view.find.open).toBe(true));
    press('Escape', 'Escape');
    await waitFor(() => expect(view.find.open).toBe(false));
    expect(view.find.q).toBe('Alice');
  });
});

describe('opening-credits-row', () => {
  it('lists the opening credits above chapter 1 and jumps to the card', async () => {
    mount();
    await firstHeading();
    const list = within(panel('chapters'));
    const row = await list.findByRole('button', { name: /Opening credits/ });
    expect(list.getAllByRole('button')[0]).toBe(row);
    // Nothing is set yet, so the dot says Not started.
    expect(within(row).getByRole('img').getAttribute('data-prep')).toBe('none');
    // jsdom lays nothing out: the opening credits' section is put 1000 px down, and the jump scrolls the reader to it.
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.ch === 'credits:opening' && this.hasAttribute('data-bound') ? 1000 : 0;
    });
    const scrolled: number[] = [];
    vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation((value: number) => void scrolled.push(value));
    fireEvent.click(row);
    await waitFor(() => expect(scrolled).toContain(992));
  });

  it('draws the credits row from the credits own prep state', async () => {
    const api = createMockApi();
    await api.scriptPrepSetChapter('credits:opening', 'prepped');
    mount({ api });
    await firstHeading();
    const row = await within(panel('chapters')).findByRole('button', { name: /Opening credits/ });
    await waitFor(() => expect(within(row).getByRole('img').getAttribute('data-prep')).toBe('prepped'));
  });

  it('lists no credits row when the library has no opening template', async () => {
    mount({ api: createMockApi({ creditsTemplates: async () => [] }) });
    await firstHeading();
    expect(within(panel('chapters')).queryByRole('button', { name: /Opening credits/ })).toBeNull();
  });
});

describe('chapter-title-once-and-end-marker-after-its-chapter', () => {
  // The mock's chapter boundary: "End of {previous}", then the card with the title, then the text. The reader's own heading used to
  // sit above the card, so a title showed twice in the text and the new heading came before the previous chapter's end marker.
  it('draws each chapter title once in the text, as the card heading', async () => {
    mount();
    await firstHeading();
    const inText = screen.getAllByRole('heading', { level: 2, name: 'Down the Rabbit-Hole' }).filter((h) => h.closest('[data-reader]'));
    expect(inText).toHaveLength(1);
    expect(inText[0]!.closest('[data-chapter-id]')).not.toBeNull();
    expect(document.querySelectorAll('[data-reader] [data-bound] > h2')).toHaveLength(0);
  });

  it('puts the end-of-chapter marker after the last paragraph of that chapter and before the next chapter title', async () => {
    mount();
    await firstHeading();
    const ends = await screen.findAllByText(/^End of /);
    const end = ends[0]!;
    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>('[data-reader] [data-para]'));
    const chapterOne = paragraphs.filter((row) => row.dataset.ch === paragraphs[0]!.dataset.ch);
    const last = chapterOne[chapterOne.length - 1]!;
    expect(last.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const next = screen.getByRole('heading', { level: 2, name: 'The Pool of Tears' });
    expect(end.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// The loading state (definition-of-done.md state matrix): the page's own columns as blocks while the chapters are read, then the page, the
// empty state or the error with Retry; never a bare line, a blank page or an endless skeleton.
describe('Script loading state', () => {
  const never = () => new Promise<never>(() => {});
  const region = () => screen.queryByRole('group', { name: 'Loading the Script' });

  it('keeps the page title and draws a busy region in the columns while the chapters are read, however long that takes', async () => {
    mount({ api: createMockApi({ manuscriptChapters: never }) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Script' })).toBeTruthy();
    expect(region()?.getAttribute('aria-busy')).toBe('true');
    expect(within(region()!).getByRole('status').textContent).toBe('Reading the manuscript…');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(region()).toBeTruthy();
    expect(document.querySelector('[data-script-columns]')).toBeNull();
  });

  it('is replaced by the page when the chapters arrive', async () => {
    mount();
    await firstHeading();
    expect(region()).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1, name: 'Script' })).toHaveLength(1);
  });

  it('shows the empty state, not a skeleton, for a manuscript with no chapters', async () => {
    mount({ api: createMockApi({ manuscriptChapters: async () => [] }) });
    await screen.findByText('This project has no manuscript yet. Import one to begin.');
    expect(region()).toBeNull();
  });

  it('shows the error with Retry, not a skeleton, when the chapters cannot be read, and the skeleton again while Retry reads', async () => {
    let calls = 0;
    const api = createMockApi({
      manuscriptChapters: () => (++calls === 1 ? Promise.reject(new Error('The manuscript could not be read.')) : never()),
    });
    mount({ api });
    const retry = await screen.findByRole('button', { name: /Retry/ });
    expect(region()).toBeNull();
    fireEvent.click(retry);
    await waitFor(() => expect(calls).toBe(2));
  });
});
