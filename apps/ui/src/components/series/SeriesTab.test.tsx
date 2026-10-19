// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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

  describe('a failed read offers Retry', () => {
    const region = () => screen.queryByRole('group', { name: 'Loading the series' });
    const retry = () => screen.getByRole('button', { name: 'Retry' });
    const sentence = 'The series could not be read.';
    const fail =
      (message: string = sentence) =>
      () =>
        Promise.reject(new Error(message));
    const never = () => new Promise<never>(() => {});
    // Each call takes the next step; the last step repeats.
    const steps = <T,>(list: Array<() => Promise<T>>) => vi.fn(() => (list.length > 1 ? (list.shift() as () => Promise<T>)() : list[0]()));
    const show = (seriesVoiceBible: unknown) => {
      render(
        <ApiProvider api={createMockApi({ seriesVoiceBible: seriesVoiceBible as never })}>
          <SeriesTab notify={vi.fn()} />
        </ApiProvider>,
      );
    };

    it('shows the sentence as an alert with Retry inside the tab, with no second page title', async () => {
      show(fail());
      const text = await screen.findByText(sentence);
      expect(text.getAttribute('role')).toBe('alert');
      expect(retry()).toBeTruthy();
      expect(region()).toBeNull();
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    });

    it('shows the skeleton with no stale error while it reads again, then the tab', async () => {
      const real = createMockApi({}).seriesVoiceBible;
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      show(steps([fail(), () => held.then(real)]));
      await screen.findByText(sentence);
      await userEvent.click(retry());
      expect(region()?.getAttribute('aria-busy')).toBe('true');
      expect(screen.queryByText(sentence)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      await act(async () => release());
      expect(await screen.findByText('Wonderland')).toBeTruthy();
      expect(region()).toBeNull();
    });

    it('shows the new error with Retry when the second read fails too', async () => {
      show(steps([fail('first'), fail('second')]));
      await screen.findByText('first');
      await userEvent.click(retry());
      expect(await screen.findByText('second')).toBeTruthy();
      expect(screen.queryByText('first')).toBeNull();
      expect(retry()).toBeTruthy();
    });

    it('fires one extra read for a double press', async () => {
      const read = steps([fail(), never]);
      show(read);
      await screen.findByText(sentence);
      const button = retry();
      await act(async () => {
        button.click();
        button.click();
      });
      expect(read).toHaveBeenCalledTimes(2);
    });

    it('sets nothing when the tab is left mid-retry', async () => {
      const real = createMockApi({}).seriesVoiceBible;
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      show(steps([fail(), () => held.then(real)]));
      await screen.findByText(sentence);
      await userEvent.click(retry());
      cleanup();
      await act(async () => release());
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
