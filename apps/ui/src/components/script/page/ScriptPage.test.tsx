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
import { CommandRouter } from '../../../input/router';
import { contextItemsFor } from '../../../registries/context';
import { searchAll } from '../../../registries/search';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { NarrationApi } from '../../../types';
import { saveCreditsExpanded } from '../../manuscript/creditsExpandedStorage';
import { TooltipProvider } from '../../primitives/Tooltip';
import type { ScriptPage as OldScriptPage } from '../ScriptPage';
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
  const handlers = { notify: vi.fn(), focusStoryBibleEntity: vi.fn(), goToBooth: vi.fn(), goToWorkspace: vi.fn() };
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

  it('shows the Opening and Closing credits cards before the first chapter, open by default', async () => {
    mount();
    await firstHeading();
    const opening = await screen.findByRole('heading', { name: 'Opening credits' });
    expect(screen.getByRole('heading', { name: 'Closing credits' })).toBeTruthy();
    const chapterOne = screen.getByRole('heading', { level: 2, name: 'Chapter 1' });
    expect(chapterOne.compareDocumentPosition(opening) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await within(card('Opening credits')).findByText(/unresolved token/)).toBeTruthy();
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

describe('props-match-the-old-page', () => {
  it('takes the old ScriptPage props, so the route swap is one line', () => {
    type Old = Parameters<typeof OldScriptPage>[0];
    const same: Old = { notify: vi.fn(), focusStoryBibleEntity: vi.fn(), goToWorkspace: vi.fn(), projectFolder: '/p', goToBooth: vi.fn() };
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
