// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { createMockApi } from '../api/mockApi';
import { StudioProvider, useStoreHandle } from './StudioProvider';
import { useChapterText } from './useChapterText';

afterEach(cleanup);

const withProvider = (api: ReturnType<typeof createMockApi>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
  };

describe('useChapterText (#3658)', () => {
  it('reads a chapter once for readers that mount together and for one that mounts later', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const first = renderHook(() => [useChapterText(chapter!.id), useChapterText(chapter!.id)], { wrapper: withProvider(api) });
    await waitFor(() => expect(first.result.current[0]!.paragraphs).toBeDefined());
    expect(read).toHaveBeenCalledTimes(1);
    expect(first.result.current[1]!.paragraphs).toBe(first.result.current[0]!.paragraphs);
    expect(first.result.current[0]!.loading).toBe(false);
  });

  it('reads another chapter when the chapter changes, and not the first again when it comes back', async () => {
    const api = createMockApi();
    const [one, two] = await api.manuscriptChapters();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const { result, rerender } = renderHook(({ id }) => useChapterText(id), { wrapper: withProvider(api), initialProps: { id: one!.id } });
    await waitFor(() => expect(result.current.paragraphs).toBeDefined());
    rerender({ id: two!.id });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    rerender({ id: one!.id });
    await waitFor(() => expect(result.current.paragraphs).toBeDefined());
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('reads nothing without a chapter, and says loading until the first answer', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const none = renderHook(() => useChapterText(undefined), { wrapper: withProvider(api) });
    expect(none.result.current).toEqual({ paragraphs: undefined, error: undefined, loading: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
    const [chapter] = await api.manuscriptChapters();
    const some = renderHook(() => useChapterText(chapter!.id), { wrapper: withProvider(api) });
    expect(some.result.current.loading).toBe(true);
    await waitFor(() => expect(some.result.current.loading).toBe(false));
  });

  it('empties on a project switch and reads again for the new project', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const { result } = renderHook(() => ({ text: useChapterText(chapter!.id), store: useStoreHandle() }), { wrapper: withProvider(api) });
    await waitFor(() => expect(result.current.text.paragraphs).toBeDefined());
    result.current.store.reset();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it('reads the port itself where no provider is above it', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const alone = renderHook(() => useChapterText(chapter!.id), {
      wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>,
    });
    await waitFor(() => expect(alone.result.current.paragraphs).toBeDefined());
    expect(read).toHaveBeenCalledTimes(1);
  });
});
