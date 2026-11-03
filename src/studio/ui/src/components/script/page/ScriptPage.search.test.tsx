// @vitest-environment jsdom
// The Script page's search on the host (#2775): the whole book is searched, not only the chapters the reader has read, the jump menu's
// row n opens Find at match n from the same answer, a refusal is a toast, and a screen reader hears where the search stands.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { withoutCredits } from '../../../chapterKinds';
import { CommandRouter } from '../../../input/router';
import { overlay } from '../../../overlay/overlayService';
import { searchLater, type SearchHit } from '../../../registries/search';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import type { ScriptViewState } from './data/scriptView';
import { useScriptView } from './data/useScriptData';
import { ScriptPage } from './ScriptPage';
import { bookMatches } from './tools/find/searchManuscript';

let view: ScriptViewState;
function ViewProbe() {
  [view] = useScriptView((state) => state);
  return null;
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  window.localStorage.clear();
});

function mount(api: NarrationApi = createMockApi(), at = '/script') {
  render(
    <MemoryRouter initialEntries={[at]}>
      <ApiProvider api={api}>
        <StudioProvider>
          <CommandRouter>
            <TooltipProvider>
              <ViewProbe />
              <Routes>
                <Route path="/script" element={<ScriptPage notify={vi.fn()} focusStoryBibleEntity={vi.fn()} />} />
              </Routes>
            </TooltipProvider>
          </CommandRouter>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}

const firstHeading = () => screen.findByRole('heading', { level: 2, name: 'Chapter 1: Down the Rabbit-Hole' }, { timeout: 3000 });
/** What the book's source answers for a term, as the jump menu would ask it. */
const searchBook = async (term: string): Promise<SearchHit[]> =>
  (await Promise.all(searchLater(term, new AbortController().signal).map((pending) => pending.answer))).flat().filter((hit) => hit.group === 'In the script');
const current = () => document.querySelector('.a-find-cur');

/** A word of five letters or more found in the book's last chapter and in no other. */
async function wordOnlyInTheLastChapter(api: NarrationApi): Promise<{ word: string; chapterId: string }> {
  const chapters = withoutCredits(await api.manuscriptChapters()).filter((chapter) => (chapter.contentKind ?? 'narration') === 'narration');
  const texts = await Promise.all(chapters.map(async (chapter) => (await api.manuscriptParagraphs(chapter.id)).map((row) => row.text.toLowerCase()).join(' ')));
  const last = texts[texts.length - 1]!;
  const word = [...new Set(last.match(/[a-z]{5,}/g) ?? [])].find((candidate) => texts.slice(0, -1).every((text) => !text.includes(candidate)));
  if (!word) throw new Error('the mock book has no word only in its last chapter');
  return { word, chapterId: chapters[chapters.length - 1]!.id };
}

describe('script-search-on-the-host', () => {
  it('finds a term only in a chapter the reader has not read, and choosing it reads that chapter and marks the match there', async () => {
    const api = createMockApi();
    const { word, chapterId } = await wordOnlyInTheLastChapter(api);
    const paragraphs = vi.spyOn(api, 'manuscriptParagraphs');
    mount(api);
    await firstHeading();
    expect(paragraphs.mock.calls.some(([id]) => id === chapterId)).toBe(false);
    let hits: SearchHit[] = [];
    await waitFor(async () => {
      hits = await searchBook(word);
      expect(hits.length).toBeGreaterThan(0);
    });
    act(() => hits[0]!.run());
    expect(view.find).toMatchObject({ open: true, q: word, i: 0 });
    await waitFor(() => expect(paragraphs.mock.calls.some(([id]) => id === chapterId)).toBe(true), { timeout: 5000 });
    await waitFor(() => expect(current()?.textContent?.toLowerCase()).toBe(word), { timeout: 5000 });
    expect(current()!.closest('[data-ch]')?.getAttribute('data-ch')).toBe(chapterId);
  });

  it('row n of the menu is match n of Find, from one host answer, including a paragraph with several matches', async () => {
    const api = createMockApi();
    const search = vi.spyOn(api, 'manuscriptSearch');
    mount(api);
    await firstHeading();
    const answer = await api.manuscriptSearch('the');
    search.mockClear();
    const matches = bookMatches(answer);
    // The first paragraph with more than one match, and its second match.
    const n = matches.findIndex((match, i) => i > 0 && matches[i - 1]!.paragraphId === match.paragraphId);
    expect(n).toBeGreaterThan(0);
    let hits: SearchHit[] = [];
    await waitFor(async () => {
      hits = await searchBook('the');
      expect(hits.length).toBeGreaterThan(n);
    });
    act(() => hits[n]!.run());
    expect(view.find).toMatchObject({ open: true, q: 'the', i: n });
    await waitFor(() => expect(current()).not.toBeNull(), { timeout: 5000 });
    expect(current()!.closest('[data-pid]')?.getAttribute('data-pid')).toBe(matches[n]!.paragraphId);
    // The menu and Find read one answer: the host was asked once.
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('says where the search stands to a screen reader when the answer arrives', async () => {
    const api = createMockApi();
    const { total } = await api.manuscriptSearch('alice');
    mount(api, '/script?find=Alice');
    await firstHeading();
    await waitFor(() => expect(overlay.getSnapshot().announcement).toMatch(new RegExp(`^1 of (the first \\d+ of )?${total} for “Alice”$`)));
  });

  it('says a term with no match, and a refused term in a toast with the host’s sentence', async () => {
    mount(createMockApi(), '/script?find=zqxjv');
    await firstHeading();
    await waitFor(() => expect(overlay.getSnapshot().announcement).toBe('No matches for “zqxjv”'));
    cleanup();
    const long = 'x'.repeat(10_000);
    mount(createMockApi(), `/script?find=${long}`);
    await firstHeading();
    await waitFor(() =>
      expect(overlay.getSnapshot().toasts.map((toast) => [toast.text, toast.tone])).toContainEqual([
        `Couldn't find “${long.slice(0, 40)}…” in the script: the search term is longer than 500 characters`,
        'error',
      ]),
    );
    expect(document.querySelectorAll('mark[data-kind="search"]')).toHaveLength(0);
  });
});
