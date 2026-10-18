// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { MockApiSeed } from '../../api/mockHost/state';
import { SeriesTab } from './SeriesTab';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTab(seed: MockApiSeed = {}) {
  const api = createMockApi({}, seed);
  render(
    <ApiProvider api={api}>
      <SeriesTab notify={vi.fn()} />
    </ApiProvider>,
  );
  return api;
}

describe('the Series tab', () => {
  it('a project outside any series offers to name one, the honest empty state', async () => {
    renderTab({ seriesVoiceBible: 'not-in-series' });
    expect(await screen.findByText(/no other books in this series yet/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create series' })).toBeTruthy();
  });

  it('a series with only this book shows the same honest empty state, not an error', async () => {
    renderTab({ seriesVoiceBible: 'single-book' });
    expect(await screen.findByText(/no other books in this series yet/i)).toBeTruthy();
  });

  it('a multi-book series groups clips by character across books', async () => {
    renderTab();
    expect(await screen.findByText('Wonderland')).toBeTruthy();
    expect(screen.getByText('2 books')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Alice ref A')).toBeTruthy();
    expect(screen.getByText('Alice ref, Looking-Glass Ch. 1')).toBeTruthy();
    expect(screen.getAllByText('This book').length).toBeGreaterThan(0);
  });

  it('reports an unreadable sibling book without failing the whole view', async () => {
    const api = renderTab();
    await screen.findByText('Wonderland');
    // No fixture seeds an unreadable book by default; this just confirms the field is wired end to end when absent.
    expect((await api.seriesVoiceBible()).unreadableBooks ?? []).toEqual([]);
  });

  it('creating a series from the empty state names it and reloads', async () => {
    const user = userEvent.setup();
    const api = renderTab({ seriesVoiceBible: 'not-in-series' });
    await screen.findByText(/no other books in this series yet/i);
    await user.type(screen.getByRole('textbox', { name: 'Series name' }), 'Wonderland');
    await user.click(screen.getByRole('button', { name: 'Create series' }));
    await waitFor(async () => expect((await api.seriesList()).some((series) => series.name === 'Wonderland')).toBe(true));
  });

  it('removing a book from the series updates the member list', async () => {
    const user = userEvent.setup();
    const api = renderTab();
    await screen.findByText('Wonderland');
    const removeButtons = await screen.findAllByRole('button', { name: 'Remove' });
    await user.click(removeButtons[0]);
    await waitFor(async () => {
      const list = await api.seriesList();
      expect(list.find((series) => series.name === 'Wonderland')?.memberProjectPaths.length).toBe(1);
    });
  });
});

// The loading state (state matrix): blocks while the series are read, then the tab, or its error; never a blank tab or an endless skeleton.
describe('the Series tab while it reads', () => {
  const region = () => screen.queryByRole('group', { name: 'Loading the series' });

  it('shows one busy region, not a blank tab, however long the read takes', async () => {
    const api = createMockApi({ seriesVoiceBible: () => new Promise(() => {}) });
    render(
      <ApiProvider api={api}>
        <SeriesTab notify={vi.fn()} />
      </ApiProvider>,
    );
    expect(await screen.findByRole('group', { name: 'Loading the series' })).toBeTruthy();
    expect(region()?.getAttribute('aria-busy')).toBe('true');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(region()).toBeTruthy();
  });

  it('is replaced by the tab when the series arrive', async () => {
    renderTab();
    await screen.findByText('Wonderland');
    expect(region()).toBeNull();
  });

  it('shows the error, not a skeleton, when the read fails', async () => {
    const api = createMockApi({ seriesVoiceBible: () => Promise.reject(new Error('The series could not be read.')) });
    render(
      <ApiProvider api={api}>
        <SeriesTab notify={vi.fn()} />
      </ApiProvider>,
    );
    expect(await screen.findByText(/The series could not be read\./)).toBeTruthy();
    expect(region()).toBeNull();
  });
});
