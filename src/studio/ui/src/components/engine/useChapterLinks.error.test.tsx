// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import { ChapterTrackStateProvider, useChapterTrackState, type ChapterTrackState } from '../chapterTracks/ChapterTrackState';
import { useChapterLinks, type ChapterLinks } from './useChapterLinks';

afterEach(cleanup);

describe('the chapter links reader', () => {
  it('drops the error of a failed read once a later read answers', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const real = api.chapterTrackMapList.bind(api);
    let failing = true;
    api.chapterTrackMapList = async () => {
      if (failing) throw new Error('locked');
      return real();
    };
    const seen: { current?: ChapterLinks } = {};
    function Probe({ refreshKey }: { refreshKey: number }) {
      seen.current = useChapterLinks(WIRE_TRACKS_PROJECT.tracks, refreshKey, () => {});
      return null;
    }
    const tree = (refreshKey: number) => (
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <Probe refreshKey={refreshKey} />
        </ChapterTrackStateProvider>
      </ApiProvider>
    );
    const view = render(tree(0));
    await waitFor(() => expect(seen.current?.error).toContain('locked'));
    failing = false;
    await act(async () => view.rerender(tree(1)));
    await waitFor(() => expect(seen.current?.error).toBe(''));
    expect(seen.current?.mappings.length).toBeGreaterThan(0);
  });

  it('a link cleared through the reader shows in another screen at once, and the row stays busy until it does', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const seen: { links?: ChapterLinks; other?: ChapterTrackState } = {};
    function Engine() {
      seen.links = useChapterLinks(WIRE_TRACKS_PROJECT.tracks, 0, () => {});
      return null;
    }
    function Booth() {
      seen.other = useChapterTrackState();
      return null;
    }
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <Engine />
          <Booth />
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    await waitFor(() => expect(seen.other?.mappings.length).toBeGreaterThan(0));
    const chapterId = seen.other!.mappings[0].chapterId;
    await act(async () => seen.links?.unlink(chapterId));
    await waitFor(() => expect(seen.links?.busyChapterId).toBe(''));
    expect(seen.other?.mappings.some((mapping) => mapping.chapterId === chapterId)).toBe(false);
    expect(seen.links?.mappings.some((mapping) => mapping.chapterId === chapterId)).toBe(false);
  });
});
