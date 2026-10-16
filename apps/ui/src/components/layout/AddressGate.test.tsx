// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_ADDRESS_TEXT } from '../../navigation/address';
import type { AddressPage } from '../../navigation/address';
import { AddressGate } from './AddressGate';

afterEach(cleanup);

const Where = () => {
  const { pathname, search, hash } = useLocation();
  return <span data-testid="where">{pathname + search + hash}</span>;
};

type Chapters = readonly { id: string }[] | null;

function mount(options: { at: string; page: AddressPage; chapters?: Chapters | null; reload?: () => Promise<void>; route?: string; param?: string }) {
  const reload = options.reload ?? vi.fn().mockResolvedValue(undefined);
  const ui = (chapters: Chapters) => (
    <MemoryRouter initialEntries={[options.at]}>
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

  it('Go to Production leaves the bad address', async () => {
    mount({ at: '/booth?chapter=a&chapter=b', page: 'booth' });
    await userEvent.click(screen.getByRole('button', { name: 'Go to Production' }));
    expect(screen.getAllByTestId('where')[0]!.textContent).toBe('/');
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
});
