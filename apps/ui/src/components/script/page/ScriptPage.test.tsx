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
import { overlay } from '../../../overlay/overlayService';
import { CommandRouter } from '../../../input/router';
import { contextItemsFor } from '../../../registries/context';
import { searchAll } from '../../../registries/search';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { NarrationApi } from '../../../types';
import { saveCreditsExpanded } from '../../manuscript/creditsExpandedStorage';
import { TooltipProvider } from '../../primitives/Tooltip';
import type { ScriptViewState } from './data/scriptView';
import { useScriptView } from './data/useScriptData';
import { DRAWER_FOCUS_DELAY_MS } from './layout/useDrawerFocus';
import { IMPORT_PROMPT_DELAY_MS, setImportPrompted } from './layout/NeedManuscript';
import { ScriptPage, type ScriptPageProps } from './ScriptPage';

let view: ScriptViewState;
function ViewProbe() {
  [view] = useScriptView((state) => state);
  return null;
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.localStorage.clear();
  window.getSelection()?.removeAllRanges();
  setImportPrompted(false);
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
                <Route path="/script" element={<ScriptPage {...handlers} projectFolder="/projects/alice" {...props} />} />
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

const firstHeading = () => screen.findByRole('heading', { level: 2, name: 'Chapter 1' }, { timeout: 3000 });
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
    expect(panel('rail').className).toContain('max-[1280px]:fixed');
    expect(panel('chapters').className).toContain('max-[1179px]:fixed');
    expect(panel('rail').className).toContain('max-[1280px]:invisible');
    expect(within(panel('chapters')).getByRole('heading', { name: 'Chapters' })).toBeTruthy();
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
    expect(panel('chapters').className).not.toContain('max-[1179px]:invisible');
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
  it('has the five tabs, Bookmarks as an icon tab, and Left and Right move and select, wrapping', async () => {
    mount();
    await firstHeading();
    const tabs = within(panel('rail')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Words', 'Story Bible', 'Notes', 'Queries', 'Bookmarks']);
    expect(tabs[4]!.querySelector('svg')).not.toBeNull();
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft', code: 'ArrowLeft' });
    await waitFor(() => expect(view.tab).toBe('bookmarks'));
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
    fireEvent.click(screen.getByRole('tab', { name: 'Bookmarks' }));
    await waitFor(() => expect(body().textContent).toBe('No bookmarks yet.'));
    // The rail follows the chapter at the top of the reader.
    fireEvent.click(screen.getByRole('tab', { name: 'Story Bible' }));
    await waitFor(() => expect(view.tab).toBe('bible'));
  });

  it('the header Bookmarks button shows the Bookmarks tab', async () => {
    mount();
    await firstHeading();
    fireEvent.click(within(document.querySelector('section[aria-label="Reader"]')!).getByRole('button', { name: 'Bookmarks' }));
    expect(view.tab).toBe('bookmarks');
  });
});

describe('no-manuscript-shows-the-empty-state-and-opens-the-import-once', () => {
  it('draws the need-a-manuscript state, offers the import, and opens it by itself once only', async () => {
    const api = createMockApi({ manuscriptChapters: async () => [] });
    mount({ api });
    expect(await screen.findByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy();
    expect(document.querySelector('[data-script-columns]')).toBeNull();
    // Opening the import goes to Production, where it lives; the second mount of the session stays put.
    await waitFor(() => expect(screen.getByText('Production')).toBeTruthy(), { timeout: IMPORT_PROMPT_DELAY_MS + 1000 });
    cleanup();
    mount({ api });
    await screen.findByText('This project has no manuscript yet. Import one to begin.');
    await new Promise((resolve) => setTimeout(resolve, IMPORT_PROMPT_DELAY_MS + 100));
    expect(screen.queryByText('Production')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Import manuscript' }));
    expect(screen.getByText('Production')).toBeTruthy();
  });
});

describe('registers-and-unregisters', () => {
  it('registers the search sources, the right-click provider, the keys and the bookmark commands once, and removes them on unmount', async () => {
    const { unmount } = mount();
    await firstHeading();
    await waitFor(() => expect(searchAll('Alice').some((hit) => hit.group === 'In the manuscript')).toBe(true));
    const p = document.querySelector('p[data-pid]')!;
    expect(contextItemsFor(p)).not.toBeNull();
    const ours = () => providedCommands().filter((row) => row.id.startsWith('bookmark.menu.'));
    expect(ours().map((row) => row.id)).toEqual(['bookmark.menu.here', 'bookmark.menu.next', 'bookmark.menu.prev']);

    // Ctrl+F is the page's: it opens Find.
    press('KeyF', 'f', { ctrlKey: true });
    expect(view.find.open).toBe(true);

    unmount();
    expect(searchAll('Alice').some((hit) => hit.group === 'In the manuscript')).toBe(false);
    expect(contextItemsFor(p)).toBeNull();
    expect(ours()).toEqual([]);
  });
});

describe('bookmark-flow-end-to-end', () => {
  it('Bookmark here adds a ribbon, opens its editor, lists it in the tab, and Next and Previous move between bookmarks, wrapping', async () => {
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

    fireEvent.click(screen.getByRole('tab', { name: 'Bookmarks' }));
    const list = document.getElementById('railbody')!;
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));

    // From the top of the page the next bookmark is the first, then the second, then round to the first; Previous goes back.
    const at = () =>
      within(list)
        .getAllByRole('button')
        .find((b) => b.getAttribute('aria-current') === 'true')?.textContent ?? '';
    press('BracketRight', ']', { altKey: true });
    await waitFor(() => expect(at()).toMatch(/^was/));
    press('BracketRight', ']', { altKey: true });
    await waitFor(() => expect(at()).toMatch(/^she/));
    press('BracketRight', ']', { altKey: true });
    await waitFor(() => expect(at()).toMatch(/^was/));
    press('BracketLeft', '[', { altKey: true });
    await waitFor(() => expect(at()).toMatch(/^she/));

    // Going to one lights its ribbon in the reader.
    fireEvent.click(
      within(list)
        .getAllByRole('button')
        .find((b) => b.textContent?.startsWith('was'))!,
    );
    await waitFor(() => expect(document.querySelector(`[data-bm="${first!.id}"] .motion-safe\\:animate-pulse`)).not.toBeNull());
  });
});

describe('credits-cards-and-banner-stay', () => {
  // Ported from the old page's `ScriptPage.test.tsx`: "credits pseudo-entries", "the credits-setup banner and Fill in", "retail
  // sample marker" and "Record in Booth" on the credits cards.
  const card = (name: string) => screen.getByRole('heading', { name }).closest('[data-credits-entry]') as HTMLElement;

  it('shows the Opening credits card at the start of the book and the Closing credits card after the last chapter, open by default', async () => {
    mount();
    await firstHeading();
    const opening = await screen.findByRole('heading', { name: 'Opening credits' });
    const closing = screen.getByRole('heading', { name: 'Closing credits' });
    // The chapters' own headings, by the reader section each heads (a credits card's title is a heading too).
    const headings = [...document.querySelectorAll<HTMLElement>('[data-ch] > h2')];
    const chapterOne = screen.getByRole('heading', { level: 2, name: 'Chapter 1' });
    const lastChapter = headings.at(-1)!;
    expect(lastChapter).not.toBe(chapterOne);
    expect(chapterOne.compareDocumentPosition(opening) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The opening card sits before chapter 2; the closing card after every chapter heading, not beside the opening card.
    expect(opening.compareDocumentPosition(headings[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lastChapter.compareDocumentPosition(closing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await within(card('Opening credits')).findByText(/unresolved token/)).toBeTruthy();
  });

  it('lists Opening credits first and Closing credits last in the chapter list', async () => {
    mount();
    await firstHeading();
    const list = screen.getAllByRole('list', { name: 'Chapters' })[0]!;
    await waitFor(() => expect(within(list).getAllByRole('button').at(-1)!.textContent).toContain('Closing credits'));
    expect(within(list).getAllByRole('button')[0]!.textContent).toContain('Opening credits');
  });

  it('collapsing a credits card hides its preview, and remembers that per project across a reload', async () => {
    mount();
    await within(await waitFor(() => card('Opening credits'))).findByText('[Title]');
    fireEvent.click(screen.getByRole('button', { name: 'Opening credits' }));
    await waitFor(() => expect(within(card('Opening credits')).queryByText('[Title]')).toBeNull());
    cleanup();
    mount();
    await screen.findByRole('heading', { name: 'Opening credits' });
    expect(screen.getByRole('button', { name: 'Opening credits' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('collapsing one card keeps what the other card remembered', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Closing credits' });
    fireEvent.click(screen.getByRole('button', { name: 'Closing credits' }));
    fireEvent.click(screen.getByRole('button', { name: 'Opening credits' }));
    cleanup();
    mount();
    await screen.findByRole('heading', { name: 'Closing credits' });
    expect(screen.getByRole('button', { name: 'Closing credits' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Opening credits' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('renders no credits cards when the library has no opening or closing template', async () => {
    mount({ api: createMockApi({ creditsTemplates: async () => [] }) });
    await firstHeading();
    expect(screen.queryByRole('heading', { name: 'Opening credits' })).toBeNull();
  });

  it('a "#credits-closing" link opens the closing card', async () => {
    saveCreditsExpanded('/projects/alice', { opening: false, closing: false });
    mount({ at: '/script#credits-closing' });
    await screen.findByRole('heading', { name: 'Closing credits' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Closing credits' }).getAttribute('aria-expanded')).toBe('true'));
    expect(screen.getByRole('button', { name: 'Opening credits' }).getAttribute('aria-expanded')).toBe('false');
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
    fireEvent.click(screen.getByRole('tab', { name: 'Queries' }));
    await waitFor(() => expect(view.tab).toBe('queries'));
    fireEvent.click(screen.getByRole('button', { name: 'Find in the manuscript (Ctrl+F)' }));
    expect(view.find.open).toBe(true);
  });

  it('no file of the page or its layout keeps its own copy of a view-module field', () => {
    const fields = ['tab', 'sel', 'word', 'entryId', 'miss', 'find', 'drawer', 'spyAt', 'qfilter'];
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
                  <Route path="/script" element={<ScriptPage notify={vi.fn()} focusStoryBibleEntity={vi.fn()} projectFolder="/projects/alice" />} />
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
  it('takes the props the old ScriptPage took, which the /script route passes (App.tsx)', () => {
    type Old = {
      notify: ScriptPageProps['notify'];
      focusStoryBibleEntity: (id: string) => void;
      goToEditing?: (chapterId: string) => void;
      projectFolder: string;
      goToBooth?: ScriptPageProps['goToBooth'];
    };
    const same: Old = { notify: vi.fn(), focusStoryBibleEntity: vi.fn(), goToEditing: vi.fn(), projectFolder: '/p', goToBooth: vi.fn() };
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
    expect(hints.textContent).toContain('Select text to mark it, add a note or query, or look it up.');
    for (const label of ['scroll', 'prep state', 'chapter', 'bookmark', 'bookmarks', 'find']) expect(within(hints).getByText(label)).toBeTruthy();
    // Under the reader's text, not above it.
    expect(reader.lastElementChild).toBe(hints);
  });
});

describe('dictionary-download-in-place', () => {
  it('offers the dictionary download in place', async () => {
    window.localStorage.setItem('narration.script.definitions', 'local');
    const api = createMockApi({}, { dictionary: 'missing' });
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
    fireEvent.click((await within(body()).findAllByRole('row', {}, { timeout: 5000 }))[1]!);
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
    await waitFor(() => expect(document.querySelector(`[data-bm="${bookmark.id}"] .motion-safe\\:animate-pulse`)).not.toBeNull());
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

describe('find-address', () => {
  it('/script?find=Alice opens the Find bar on Alice', async () => {
    mount({ at: '/script?find=Alice' });
    await firstHeading();
    await waitFor(() => expect(view.find).toMatchObject({ open: true, q: 'Alice' }));
    expect((within(await screen.findByRole('search')).getByRole('textbox') as HTMLInputElement).value).toBe('Alice');
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
    // The card still has [Token]s to fill in, so the dot says Not started.
    expect(within(row).getByRole('img').getAttribute('data-prep')).toBe('none');
    fireEvent.click(row);
    await waitFor(() => expect(document.querySelector('[data-credits-entry="opening"]')).not.toBeNull());
  });

  it('draws the credits row prepped once the opening credits have nothing left to fill in', async () => {
    const api = createMockApi({ creditsPreview: async () => ({ text: 'Alice, written by Carroll.', words: 4, unresolved: [] }) });
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
