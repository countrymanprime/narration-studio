// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandRouter } from '../../input/router';
import { MAX_ADDRESS_TEXT } from '../../navigation/address';
import type { AddressPage } from '../../navigation/address';
import { AddressGate } from './AddressGate';

afterEach(cleanup);

const Where = () => {
  const { pathname, search, hash } = useLocation();
  return <span data-testid="where">{pathname + search + hash}</span>;
};

type Chapters = readonly { id: string; paragraphIds?: readonly { id: string }[] }[] | null;

function mount(options: { at: string; page: AddressPage; chapters?: Chapters | null; reload?: () => Promise<void>; route?: string; param?: string }) {
  const reload = options.reload ?? vi.fn().mockResolvedValue(undefined);
  const ui = (chapters: Chapters) => (
    <MemoryRouter initialEntries={[options.at]}>
      <CommandRouter>
        <Routes>
          <Route
            path={options.route ?? '/booth'}
            element={
              <AddressGate page={options.page} chapterParam={options.param} chapters={chapters} reloadChapters={reload}>
                <p>the page</p>
              </AddressGate>
            }
          />
          <Route path="*" element={<Where />} />
        </Routes>
        <Where />
      </CommandRouter>
    </MemoryRouter>
  );
  const view = render(ui('chapters' in options ? options.chapters! : [{ id: 'c1' }, { id: 'c2' }]));
  return { reload, rerender: (chapters: Chapters) => view.rerender(ui(chapters)) };
}

describe('AddressGate', () => {
  it('opens the page for an address that names nothing, or a chapter the manuscript has', () => {
    mount({ at: '/booth', page: 'booth' });
    expect(screen.getByText('the page')).toBeTruthy();
    cleanup();
    mount({ at: '/booth?chapter=c2&para=p1&at=3', page: 'booth' });
    expect(screen.getByText('the page')).toBeTruthy();
  });

  it('says what is wrong with a malformed address and offers the page and Production, rather than rendering nothing', async () => {
    mount({ at: `/booth?chapter=${'x'.repeat(MAX_ADDRESS_TEXT + 1)}`, page: 'booth' });
    expect(screen.queryByText('the page')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Booth link cannot be opened');
    await userEvent.click(screen.getByRole('button', { name: 'Open Booth' }));
    expect(screen.getByText('the page')).toBeTruthy();
    expect(screen.getAllByTestId('where')[0]!.textContent).toBe('/booth');
  });

  it('offers one solid way forward: Open <page> is primary and Go to Production is the quieter second choice', () => {
    mount({ at: '/booth?chapter=a&chapter=b', page: 'booth' });
    const solid = (name: string) => screen.getByRole('button', { name }).className.includes('bg-[var(--accent)]');
    expect(solid('Open Booth')).toBe(true);
    expect(solid('Go to Production')).toBe(false);
  });

  it('Go to Production leaves the bad address', async () => {
    mount({ at: '/booth?chapter=a&chapter=b', page: 'booth' });
    await userEvent.click(screen.getByRole('button', { name: 'Go to Production' }));
    expect(screen.getAllByTestId('where')[0]!.textContent).toBe('/');
  });

  it('Escape leaves a bad Booth address for the Script page, as it leaves the Booth: the Booth fills the window, so there is no other way out', () => {
    mount({ at: '/booth?chapter=a&chapter=b', page: 'booth' });
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(screen.getAllByTestId('where')[0]!.textContent).toBe('/script');
  });

  it('Escape leaves a Booth link to a chapter that is gone, too', async () => {
    mount({ at: '/booth?chapter=c3', page: 'booth' });
    await screen.findByRole('alert');
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(screen.getAllByTestId('where')[0]!.textContent).toBe('/script');
  });

  it('Escape on a bad link that opened a pickup session returns to Pickups, as the working Booth does', async () => {
    mount({ at: '/booth?chapter=c3&pickups=k1,k2', page: 'booth' });
    await screen.findByRole('alert');
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(screen.getAllByTestId('where')[0]!.textContent).toBe('/pickups');
  });

  it('Escape returns to Pickups when the pickups are what is bad (named twice), because the link still names a session', () => {
    mount({ at: '/booth?pickups=k1&pickups=k2', page: 'booth' });
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(screen.getAllByTestId('where')[0]!.textContent).toBe('/pickups');
  });

  it('Escape goes to Script when a bad link names no pickups (an empty list is no session)', () => {
    mount({ at: '/booth?chapter=a&chapter=b&pickups=', page: 'booth' });
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(screen.getAllByTestId('where')[0]!.textContent).toBe('/script');
  });

  it('other keys do nothing on a bad Booth address', () => {
    mount({ at: '/booth?chapter=a&chapter=b', page: 'booth' });
    for (const [key, code] of [
      [' ', 'Space'],
      ['Enter', 'Enter'],
      ['r', 'KeyR'],
      ['F11', 'F11'],
    ] as const)
      fireEvent.keyDown(document.body, { key, code });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getAllByTestId('where')[0]!.textContent).toBe('/booth?chapter=a&chapter=b');
  });

  it('Escape on a bad address of a page that keeps its sidebar does nothing', () => {
    mount({ at: '/editing/a%20b?x=1&x=2', page: 'editing', route: '/editing/:chapterId' });
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('alert') ?? screen.queryByText('the page')).toBeTruthy();
  });

  it('reads the list again before it calls a chapter stale, and opens the page when the new chapter is there', async () => {
    let resolve!: () => void;
    const reload = vi.fn(() => new Promise<void>((done) => (resolve = done)));
    const view = mount({ at: '/booth?chapter=c3', page: 'booth', reload });
    expect(screen.getByRole('status').textContent).toContain('Checking');
    expect(reload).toHaveBeenCalledTimes(1);
    view.rerender([{ id: 'c1' }, { id: 'c3' }]);
    await act(async () => resolve());
    expect(screen.getByText('the page')).toBeTruthy();
  });

  // The state matrix for the re-read: checking (the page's title and blocks, one polite status), found, gone, and the host not answering.
  describe('while it re-reads the chapter list', () => {
    const checking = (page: AddressPage, at: string, route: string) => {
      const reload = vi.fn(() => new Promise<void>(() => {}));
      mount({ at, page, route, reload, param: 'c9' });
    };

    it.each([
      ['proof', 'Proof', '/proof?chapter=c9', '/proof'],
      ['editing', 'Editing', '/editing/c9', '/editing/:chapterId'],
      ['booth', 'Booth', '/booth?chapter=c9', '/booth'],
    ] as const)('%s keeps its title and draws one busy region with the single status in place of a bare sentence', (page, title, at, route) => {
      checking(page, at, route);
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
      const region = screen.getByRole('group', { name: 'Checking this link' });
      expect(region.getAttribute('aria-busy')).toBe('true');
      expect(within(region).getByRole('status').textContent).toBe('Checking this link…');
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(screen.queryByText('the page')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('is replaced by the bad-address message, with its way out, when the fresh list still lacks the chapter', async () => {
      mount({ at: '/proof?chapter=c9', page: 'proof', route: '/proof' });
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not in this manuscript'));
      expect(screen.queryByRole('group', { name: 'Checking this link' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Open Proof' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Go to Production' })).toBeTruthy();
    });

    it('opens the page, not an endless skeleton, when the re-read fails', async () => {
      mount({ at: '/proof?chapter=c9', page: 'proof', route: '/proof', reload: () => Promise.reject(new Error('no answer')) });
      await waitFor(() => expect(screen.getByText('the page')).toBeTruthy());
      expect(screen.queryByRole('group', { name: 'Checking this link' })).toBeNull();
    });
  });

  it('says the chapter is gone when the fresh list still lacks it, and keeps the way out', async () => {
    const view = mount({ at: '/booth?chapter=gone', page: 'booth' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not in this manuscript'));
    expect(view.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Open Booth' })).toBeTruthy();
  });

  it('does not call a chapter gone when the host did not answer the re-read', async () => {
    mount({ at: '/booth?chapter=gone', page: 'booth', reload: () => Promise.reject(new Error('host down')) });
    await waitFor(() => expect(screen.getByText('the page')).toBeTruthy());
  });

  it('lets the page decide when the list cannot be checked (no manuscript, or not read yet)', () => {
    const view = mount({ at: '/booth?chapter=anything', page: 'booth', chapters: null });
    expect(screen.getByText('the page')).toBeTruthy();
    expect(view.reload).not.toHaveBeenCalled();
  });

  it('checks the Editing chapter from the route and the Booth credits address needs no chapter', async () => {
    mount({ at: '/editing/zzz', page: 'editing', route: '/editing/:chapterId', param: 'zzz' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Editing link points to a chapter'));
    cleanup();
    mount({ at: '/editing/c2', page: 'editing', route: '/editing/:chapterId', param: 'c2' });
    expect(screen.getByText('the page')).toBeTruthy();
    cleanup();
    mount({ at: '/booth?credits=opening', page: 'booth', chapters: [] });
    expect(screen.getByText('the page')).toBeTruthy();
  });

  it('asks again for a chapter that is stale a second time after A-B-A navigation', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const view = mount({ at: '/booth?chapter=gone', page: 'booth', reload });
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(reload).toHaveBeenCalledTimes(1);
    view.rerender([{ id: 'gone' }]);
    await waitFor(() => expect(screen.getByText('the page')).toBeTruthy());
    view.rerender([{ id: 'c1' }]);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
  });

  it('says the line is not in the chapter when the chapter is there and the line is not, after one re-read', async () => {
    const chapters = [
      { id: 'c1', paragraphIds: [{ id: 'p1' }] },
      { id: 'c2', paragraphIds: [{ id: 'p2' }] },
    ];
    const view = mount({ at: '/booth?chapter=c1&para=p2&at=0', page: 'booth', chapters });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('a line that is not in that chapter'));
    expect(view.reload).toHaveBeenCalledTimes(1);
    cleanup();
    mount({ at: '/booth?chapter=c1&para=p1&at=0', page: 'booth', chapters });
    expect(screen.getByText('the page')).toBeTruthy();
  });

  it('does not judge a line when the chapter lists none', () => {
    mount({ at: '/booth?chapter=c1&para=whatever', page: 'booth', chapters: [{ id: 'c1' }] });
    expect(screen.getByText('the page')).toBeTruthy();
  });

  it('checks the Proof chapter too', async () => {
    mount({ at: '/proof?chapter=nope', page: 'proof', route: '/proof' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Proof link points to a chapter'));
  });
});
