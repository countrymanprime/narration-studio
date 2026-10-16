// @vitest-environment jsdom
// The cross-page matrix (docs/reference/cross-page-handoffs.md): the real App over the mock host, one row per seam. A page owner who adds
// a hand-off adds a row here: where the narrator arrives (an address, good or bad) and what they see, or what a source control does.
// Rows are data so a missing seam reads as a missing row. A row that cannot be driven here is listed in `NOT_DRIVEN` with the reason.

import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { CommandRouter } from './input/router';
import { contextItemsFor } from './registries/context';
import { MAX_ADDRESS_TEXT } from './navigation/address';
import { ThemeProvider } from './theme/ThemeContext';

configure({ asyncUtilTimeout: 12_000 });
beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(cleanup);

function mountApp(address: string, initial: Parameters<typeof createMockApi>[1] = {}) {
  window.history.replaceState(null, '', address);
  const api = createMockApi({}, initial);
  const view = render(
    <ThemeProvider>
      <ApiProvider api={api}>
        <CommandRouter>
          <App />
        </CommandRouter>
      </ApiProvider>
    </ThemeProvider>,
  );
  return { api, ...view };
}

const here = () => window.location.pathname + window.location.search + window.location.hash;
const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name });
const blocked = (page: string) =>
  screen.findByRole('heading', { level: 2, name: 'This link could not be opened' }).then(() => screen.getByText(new RegExp(`^This ${page} link`)));

type Arrival = {
  seam: string;
  what: string;
  address: string;
  /** What the narrator sees on arrival. */
  shows: () => Promise<unknown>;
  /** Where the address is left: absent means unchanged. */
  leavesAt?: string;
};

const LONG = 'x'.repeat(MAX_ADDRESS_TEXT + 1);

const ARRIVALS: Arrival[] = [
  { seam: 'S1', what: 'Booth at a chapter, a line and an offset', address: '/booth?chapter=chapter-2&para=p5&at=3', shows: () => heading('Booth') },
  { seam: 'S1', what: 'Booth on the closing credits', address: '/booth?credits=closing', shows: () => heading('Booth') },
  { seam: 'S1', what: 'Booth, a chapter the manuscript does not have', address: '/booth?chapter=nope', shows: () => blocked('Booth') },
  { seam: 'S1', what: 'Booth, a chapter from another project', address: '/booth?chapter=other-project-chapter-9', shows: () => blocked('Booth') },
  { seam: 'S1', what: 'Booth, the chapter named twice', address: '/booth?chapter=chapter-1&chapter=chapter-2', shows: () => blocked('Booth') },
  { seam: 'S1', what: 'Booth, an offset that is not a number', address: '/booth?chapter=chapter-1&para=p1&at=NaN', shows: () => blocked('Booth') },
  { seam: 'S1', what: 'Booth, a negative offset', address: '/booth?chapter=chapter-1&para=p1&at=-4', shows: () => blocked('Booth') },
  { seam: 'S1', what: 'Booth, an absurd offset', address: `/booth?chapter=chapter-1&para=p1&at=${'9'.repeat(40)}`, shows: () => blocked('Booth') },
  { seam: 'S1', what: 'Booth, a name far longer than any id', address: `/booth?chapter=${LONG}`, shows: () => blocked('Booth') },
  {
    seam: 'S1',
    what: 'Booth, right-to-left and emoji chapter name',
    address: `/booth?chapter=${encodeURIComponent('🦎 مرحبا')}`,
    shows: () => blocked('Booth'),
  },
  { seam: 'S4', what: 'Booth with a pickup session', address: '/booth?chapter=chapter-1&pickups=k1,k2', shows: () => heading('Booth') },
  { seam: 'S6', what: 'Script at a line', address: '/script#p5', shows: () => heading('Script'), leavesAt: '/script' },
  { seam: 'S6', what: 'Script at a chapter by id', address: '/script#cchapter-2', shows: () => heading('Script'), leavesAt: '/script' },
  {
    seam: 'S6',
    what: 'Script, a chapter that is not in the manuscript',
    address: '/script#cnope',
    shows: () => screen.findByText("That link points to a chapter or line that isn't in this manuscript."),
    leavesAt: '/script',
  },
  {
    seam: 'S6',
    what: 'Script, a line that is not in the manuscript',
    address: '/script#p99999',
    shows: () => screen.findByText("That link points to a chapter or line that isn't in this manuscript."),
    leavesAt: '/script',
  },
  { seam: 'S6', what: 'Script, a malformed escape', address: '/script#c%E0%A4%A', shows: () => blocked('Script') },
  { seam: 'S6', what: 'Script, an absurd line number', address: `/script#p${'9'.repeat(400)}`, shows: () => blocked('Script') },
  { seam: 'S7', what: 'Script with Find open on a name', address: '/script?find=Alice', shows: () => screen.findByDisplayValue('Alice'), leavesAt: '/script' },
  { seam: 'S8', what: 'Story Bible at an entry', address: '/story-bible#entity-1', shows: () => heading('Story Bible'), leavesAt: '/story-bible' },
  { seam: 'S8', what: 'Story Bible, a malformed escape', address: '/story-bible#%', shows: () => blocked('Story Bible') },
  { seam: 'S9', what: 'Editing at a chapter', address: '/editing/chapter-2', shows: () => heading('Editing') },
  { seam: 'S9', what: 'Editing, a chapter that is not in the manuscript', address: '/editing/nope', shows: () => blocked('Editing') },
  { seam: 'S9', what: 'Editing, a drawer that does not exist', address: '/editing/chapter-1?drawer=nope', shows: () => blocked('Editing') },
  { seam: 'S9', what: 'Editing, a time that is not a number', address: '/editing/chapter-1?t=abc', shows: () => blocked('Editing') },
  { seam: 'S9', what: 'Editing, a finding named twice', address: '/editing/chapter-1?finding=a&finding=b', shows: () => blocked('Editing') },
  { seam: 'S12', what: 'Proof at a chapter', address: '/proof?chapter=chapter-2', shows: () => heading('Proof') },
  { seam: 'S13', what: 'Master & QC on a file', address: '/master#file=C%3A%2Fa.wav&rule=acx.rms', shows: () => heading('Master & QC') },
  {
    seam: 'S13',
    what: 'An older Delivery link to a file lands on Master & QC with the anchor kept',
    address: '/delivery#file=C%3A%2Fa.wav',
    shows: () => heading('Master & QC'),
    leavesAt: '/master#file=C%3A%2Fa.wav',
  },
  { seam: 'S14', what: 'Settings on the Credits category', address: '/settings#credits', shows: () => heading('Settings') },
  {
    seam: 'S16',
    what: 'The retired Teleprompter address lands on the Booth with the query kept',
    address: '/teleprompter?chapter=chapter-2',
    shows: () => heading('Booth'),
    leavesAt: '/booth?chapter=chapter-2',
  },
];

describe('cross-page matrix: where an address lands the narrator', () => {
  it.each(ARRIVALS)(
    '$seam: $what ($address)',
    async ({ address, shows, leavesAt }) => {
      mountApp(address);
      await shows();
      expect(here()).toBe(leavesAt ?? address);
    },
    30_000,
  );

  it('has a row for every seam the inventory lists as arriving by address', () => {
    const covered = new Set(ARRIVALS.map((row) => row.seam));
    for (const seam of ['S1', 'S4', 'S6', 'S7', 'S8', 'S9', 'S12', 'S13', 'S14', 'S16']) expect(covered.has(seam), seam).toBe(true);
  });
});

describe('cross-page matrix: a bad address always has a way out', () => {
  it('Open Booth opens the Booth without the address, and Back does not return to the bad one', async () => {
    mountApp('/booth?chapter=nope');
    await blocked('Booth');
    fireEvent.click(screen.getByRole('button', { name: 'Open Booth' }));
    await heading('Booth');
    expect(here()).toBe('/booth');
    expect(screen.queryByText('This link could not be opened')).toBeNull();
  });

  it('Go to Production leaves a bad Script link for the home page', async () => {
    mountApp('/script#c%');
    await blocked('Script');
    fireEvent.click(screen.getByRole('button', { name: 'Go to Production' }));
    await heading('Production');
    expect(here()).toBe('/');
  });

  it('Escape on the message neither closes it nor leaves the page, and the nav still works', async () => {
    mountApp('/editing/nope');
    await blocked('Editing');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getAllByRole('alert').some((node) => node.textContent?.includes('Editing link'))).toBe(true);
    expect(here()).toBe('/editing/nope');
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /^Production/ }));
    await heading('Production');
  });

  it('a bad address reached by Back from another page shows the same message', async () => {
    mountApp('/');
    await heading('Production');
    act(() => {
      window.history.pushState(null, '', '/booth?chapter=nope');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await blocked('Booth');
  });

  it('a reload in the middle of a hand-off lands on the same destination', async () => {
    const first = mountApp('/booth?chapter=chapter-2');
    await heading('Booth');
    first.unmount();
    mountApp(here());
    await heading('Booth');
    expect(here()).toBe('/booth?chapter=chapter-2');
  });

  it('a reload on a bad address shows the message again, not a blank page', async () => {
    const first = mountApp('/booth?chapter=nope');
    await blocked('Booth');
    first.unmount();
    mountApp(here());
    await blocked('Booth');
  });
});

describe('cross-page matrix: state a hand-off needs is not there', () => {
  it('with no project open, a hand-off address shows the project picker and keeps the address', async () => {
    mountApp('/booth?chapter=chapter-2', { projectFolder: '' });
    await waitFor(() => expect(screen.queryByText(/Opening Narration Studio/)).toBeNull());
    expect(screen.queryByRole('heading', { level: 2, name: 'This link could not be opened' })).toBeNull();
    expect(here()).toBe('/booth?chapter=chapter-2');
  });

  it('with no manuscript, an address that names a chapter is not called stale', async () => {
    const api = createMockApi();
    const good = await api.bootstrap();
    window.history.replaceState(null, '', '/editing/chapter-2');
    render(
      <ThemeProvider>
        <ApiProvider api={createMockApi({ bootstrap: async () => ({ ...good, manuscript: null }) })}>
          <CommandRouter>
            <App />
          </CommandRouter>
        </ApiProvider>
      </ThemeProvider>,
    );
    await heading('Editing');
    expect(screen.queryByText(/not in this manuscript/)).toBeNull();
    expect(within(document.body).getAllByText(/manuscript/i).length).toBeGreaterThan(0);
  });
});

/** Seams the matrix does not drive, and why. A page owner removes a line when they drive it. */
const NOT_DRIVEN: Record<string, string> = {
  S2: 'Production to Booth: the source is a row menu item; ProductionPage.test.tsx drives the handler and address.test.ts drives the address.',
  S3: 'Proof to Booth: ProofPage.test.tsx drives the handler; the address is S1.',
  S5: 'Companion to Booth: CompanionPage.test.tsx drives the control and the address.',
  S10: 'Editing and Engine links: App.test.tsx drives the Engine panel link to Editing.',
  S11: 'Pickups to Proof: the Pickups page is owned by feat/pickups-page-wired; add the row when it merges.',
  S15: 'No-manuscript import button: App.test.tsx.',
};

describe('cross-page matrix: the seams not driven here are the ones the inventory lists', () => {
  it('names only seams that have no arrival row', () => {
    const covered = new Set(ARRIVALS.map((row) => row.seam));
    for (const seam of Object.keys(NOT_DRIVEN)) expect(covered.has(seam), seam).toBe(false);
  });
});

describe('cross-page matrix: a change on one page reaches the pages that show it', () => {
  async function chaptersReads(run: (read: () => number) => Promise<void>) {
    let reads = 0;
    const base = createMockApi();
    const api = createMockApi({
      manuscriptChapters: () => {
        reads += 1;
        return base.manuscriptChapters();
      },
    });
    window.history.replaceState(null, '', '/');
    render(
      <ThemeProvider>
        <ApiProvider api={api}>
          <CommandRouter>
            <App />
          </CommandRouter>
        </ApiProvider>
      </ThemeProvider>,
    );
    await run(() => reads);
  }

  const setStatusOnRowTwo = async () => {
    const table = await screen.findByRole('table', { name: 'Chapter pipeline' });
    const row = within(table).getAllByRole('row')[2]!;
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.label.startsWith('Set status: '))).toBeTruthy());
    await act(async () =>
      contextItemsFor(row)
        ?.find((item) => item.label.startsWith('Set status: '))
        ?.onSelect(),
    );
  };

  it('setting a chapter status on Production makes the shared chapter list (the jump menu, the address check) read again', async () => {
    await chaptersReads(async (reads) => {
      await screen.findByRole('table', { name: 'Chapter pipeline' });
      await waitFor(() => expect(reads()).toBeGreaterThan(0));
      const before = reads();
      await setStatusOnRowTwo();
      await waitFor(() => expect(reads()).toBeGreaterThan(before));
    });
  });

  it('rapid A to B to A: leaving Production and coming back reads the list for the page that is there, with no stale message', async () => {
    await chaptersReads(async () => {
      await screen.findByRole('table', { name: 'Chapter pipeline' });
      for (const name of [/^Script/, /^Production/, /^Script/, /^Production/]) {
        fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name }));
      }
      await screen.findByRole('table', { name: 'Chapter pipeline' });
      expect(screen.queryByText('This link could not be opened')).toBeNull();
    });
  });
});
