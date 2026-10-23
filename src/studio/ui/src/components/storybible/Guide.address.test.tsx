// @vitest-environment jsdom
// The Story Bible's hand-off addresses (docs/reference/cross-page-handoffs.md, S7 and S8): `#<entity id>` arrives from the Script and
// the Booth, `?find=` leaves for the Script. Every cell goes through navigation/address.ts, and a bad or stale id is shown with a way out.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { addressPath, readAddress } from '../../navigation/address';
import { entryRows } from './entryTableTestKit';
import { Guide } from './Guide';

afterEach(cleanup);

const Where = () => {
  const { pathname, search, hash } = useLocation();
  return <p data-testid="where">{`${pathname}${search}${hash}`}</p>;
};

function renderAt(url: string) {
  window.localStorage.clear();
  render(
    <MemoryRouter initialEntries={[url]}>
      <ApiProvider api={createMockApi()}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Routes>
                <Route path="/story-bible" element={<Guide notify={vi.fn()} goToManuscript={vi.fn()} />} />
                <Route path="*" element={<Where />} />
              </Routes>
              <Where />
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
}

const openRow = () => entryRows().find((row) => row.getAttribute('aria-selected') === 'true');
const where = () => screen.getAllByTestId('where').at(-1)!.textContent;

describe('arriving at #<entity id>', () => {
  it('opens the named entry and drops the hash', async () => {
    renderAt('/story-bible#mad-hatter');
    await waitFor(() => expect(openRow()?.textContent).toContain('Hatter'));
    expect(screen.queryByRole('alert', { name: 'Link not opened' })).toBeNull();
    await waitFor(() => expect(where()).toBe('/story-bible'));
  });

  it('opens an entry whose id needs escaping', async () => {
    renderAt(`/story-bible#${encodeURIComponent('mad-hatter')}`);
    await waitFor(() => expect(openRow()?.textContent).toContain('Hatter'));
  });

  it.each([
    ['an id the Story Bible does not have', '#no-such-entry'],
    ['an emoji id', `#${encodeURIComponent('🦎')}`],
    ['a right-to-left id', `#${encodeURIComponent('שלום')}`],
    ['a very long id', `#${'x'.repeat(400)}`],
  ])('says so for %s, with a way out, and does not open another entry silently', async (_name, hash) => {
    renderAt(`/story-bible${hash}`);
    const alert = await screen.findByRole('alert', { name: 'Link not opened' });
    expect(alert.textContent).toContain('not in the Story Bible');
    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert', { name: 'Link not opened' })).toBeNull();
  });

  it('offers Go to Production from the message', async () => {
    renderAt('/story-bible#no-such-entry');
    fireEvent.click(within(await screen.findByRole('alert', { name: 'Link not opened' })).getByRole('button', { name: 'Go to Production' }));
    await waitFor(() => expect(where()).toBe('/'));
  });

  it.each([
    ['a malformed escape', '#%'],
    ['a half escape', '#%E0%A4%A'],
    ['a blank id', '#%20'],
    ['a control character', '#%00'],
    ['an id longer than an address may carry', `#${'y'.repeat(600)}`],
    ['no id', '#'],
  ])('does not throw for %s: the page opens as with no address', async (_name, hash) => {
    renderAt(`/story-bible${hash}`);
    await waitFor(() => expect(openRow()).toBeTruthy());
    expect(screen.queryByRole('alert', { name: 'Link not opened' })).toBeNull();
  });

  it('opens as usual with no hash', async () => {
    renderAt('/story-bible');
    await waitFor(() => expect(openRow()).toBeTruthy());
    expect(screen.queryByRole('alert', { name: 'Link not opened' })).toBeNull();
  });
});

describe('Find in the manuscript leaves through the address builder', () => {
  it.each(['Hatter', 'Mad & Hatter #1', '🦎', 'שלום', 'a/b?c=d', '50%', 'cut \uD83E'])('round-trips %j to the Script', async (name) => {
    const path = addressPath({ page: 'script', find: name });
    expect(path.startsWith('/script?find=')).toBe(true);
    const url = new URL(path, 'http://x');
    const read = readAddress('script', { search: url.search, hash: url.hash });
    expect(read.kind).toBe('address');
  });

  it('opens the Script from the entry header with the name', async () => {
    renderAt('/story-bible');
    await waitFor(() => expect(openRow()).toBeTruthy());
    fireEvent.click(await screen.findByRole('button', { name: 'Find in the manuscript' }));
    await waitFor(() => expect(where()).toMatch(/^\/script\?find=/));
  });
});
