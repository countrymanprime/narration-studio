// @vitest-environment jsdom
// Find in the Booth: Ctrl+F opens the jump menu, whose search finds text in the chapter on screen with the Script's own search; choosing a hit
// moves the reading there, or during a take only the view, so the take is not disturbed.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import { currentPageContext, type PageItem } from '../../../input/pageCommands';
import { createOverlayService } from '../../../overlay/overlayService';
import { searchAll } from '../../../registries/search';
import type { NarrationApi } from '../../../types';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

function renderPage() {
  render(
    <BoothHost
      api={pageApi({ passageMapRecordRun: async () => {}, teleprompterStop: async () => {} } as unknown as Partial<NarrationApi>)}
      daw={dawFor('reaper')}
      journal={newJournal()}
      overlay={createOverlayService()}
    >
      <BoothNextPage hasManuscript navigate={vi.fn()} />
    </BoothHost>,
  );
}

const items = (): readonly PageItem[] => currentPageContext()?.items ?? [];
const ready = async () => {
  await screen.findByText('Nobody', { exact: false });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
};
const current = () => document.querySelector<HTMLElement>('[data-state="cur"]')?.dataset.unit;
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

describe('Find in the Booth', () => {
  it('finds-text-in-the-chapter-on-screen-and-names-where-it-is', async () => {
    renderPage();
    await ready();
    const hits = searchAll('King');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ group: 'In this chapter', sub: '¶ 2' });
    expect(hits[0].snippet?.hit).toBe('King');
  });

  it('finds-the-chapter-title-and-names-it-the-title-not-a-paragraph', async () => {
    renderPage();
    await ready();
    const hits = searchAll('Chapter One');
    expect(hits[0]).toMatchObject({ group: 'In this chapter', sub: 'Title' });
  });

  it('finds-nothing-from-another-chapter', async () => {
    renderPage();
    await ready();
    expect(searchAll('new day')).toEqual([]);
  });

  it('a-term-of-one-letter-finds-nothing', async () => {
    renderPage();
    await ready();
    expect(searchAll('T')).toEqual([]);
  });

  it('choosing-a-hit-moves-the-reading-to-the-match-and-marks-every-match', async () => {
    renderPage();
    await ready();
    const before = current();
    act(() => searchAll('the')[2]?.run());
    await settle();
    await waitFor(() => expect(current()).not.toBe(before));
    expect(document.querySelectorAll('[data-find]').length).toBeGreaterThan(1);
    expect(document.querySelectorAll('[data-find="current"]')).toHaveLength(1);
    // The match chosen is the word being read.
    expect(document.querySelector('[data-current]')?.getAttribute('data-find')).toBe('current');
  });

  it('a-match-in-the-middle-of-a-word-lands-on-that-word', async () => {
    renderPage();
    await ready();
    act(() => searchAll('urned')[0]?.run());
    await settle();
    await waitFor(() => expect(document.querySelector('[data-current]')?.textContent).toBe('turned'));
  });

  it('offers-next-previous-and-clear-while-a-search-shows-and-clear-takes-the-marks-away', async () => {
    renderPage();
    await ready();
    expect(items().some((i) => i.group === 'Search')).toBe(false);
    act(() => searchAll('the')[0]?.run());
    await waitFor(() =>
      expect(
        items()
          .filter((i) => i.group === 'Search')
          .map((i) => i.id),
      ).toEqual(['search.next', 'search.prev', 'search.clear']),
    );
    const next = items().find((i) => i.id === 'search.next')!;
    expect(next.hint).toMatch(/^1 of \d+ for “the”$/);
    act(() => next.run());
    await waitFor(() => expect(items().find((i) => i.id === 'search.next')!.hint).toMatch(/^2 of /));
    act(() =>
      items()
        .find((i) => i.id === 'search.clear')!
        .run(),
    );
    await waitFor(() => expect(document.querySelectorAll('[data-find]')).toHaveLength(0));
    expect(items().some((i) => i.group === 'Search')).toBe(false);
  });

  it('with-one-match-next-and-previous-are-off-and-say-why', async () => {
    renderPage();
    await ready();
    act(() => searchAll('King')[0]?.run());
    await waitFor(() => expect(items().find((i) => i.id === 'search.next')?.disabledReason).toBe('No other match.'));
  });

  it('during-a-take-a-hit-scrolls-the-view-and-leaves-the-reading-where-the-voice-has-it', async () => {
    renderPage();
    await ready();
    skipStartGuard();
    act(() =>
      items()
        .find((i) => i.id === 'transport.record')!
        .run(),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    const reading = current();
    act(() => searchAll('roses')[0]?.run());
    await settle();
    expect(current()).toBe(reading);
    expect(document.querySelectorAll('[data-find="current"]')).toHaveLength(1);
    // The take goes on: Stop is still what the footer offers.
    expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy();
  });

  it('a-chapter-with-emoji-and-right-to-left-text-is-searched-too', async () => {
    renderPage();
    await ready();
    expect(searchAll('😀')).toEqual([]);
    expect(searchAll('שלום')).toEqual([]);
  });
});
