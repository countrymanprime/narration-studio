// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import { ChapterTrackStateProvider, useChapterTrackState, type ChapterTrackState } from '../chapterTracks/ChapterTrackState';
import { overlay } from '../../overlay/overlayService';
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

  // #3365: a rejected set or unlink is one error toast with the shared sentence, and no line in the page.
  it.each([
    ['set', 'The link could not be made: nope'],
    ['unlink', 'The link could not be removed: nope'],
  ] as const)('says a rejected %s as a toast and keeps the page free of a line', async (kind, sentence) => {
    const api = createMockApi({}, { voiceFolders: true });
    api.chapterTrackSet = async () => Promise.reject(new Error('nope'));
    api.chapterTrackUnlink = async () => Promise.reject(new Error('nope'));
    const seen: { current?: ChapterLinks } = {};
    function Probe() {
      seen.current = useChapterLinks(WIRE_TRACKS_PROJECT.tracks, 0, () => {});
      return null;
    }
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <Probe />
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    await waitFor(() => expect(seen.current?.mappings.length).toBeGreaterThan(0));
    const chapterId = seen.current!.mappings[0].chapterId;
    await act(async () => (kind === 'set' ? seen.current!.set(chapterId, WIRE_TRACKS_PROJECT.tracks[2].guid) : seen.current!.unlink(chapterId)));
    await waitFor(() => expect(overlay.getSnapshot().toasts.some((t) => t.text === sentence)).toBe(true));
    expect(seen.current?.error).toBe('');
  });

  // #3398 (intent review): a change that was written but whose list could not be read again still tells the screens fed by onChanged, and says so.
  it('tells onChanged and says the change was made, as a toast, when only the re-read after a good write fails', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const real = api.chapterTrackMapList.bind(api);
    let failing = false;
    api.chapterTrackMapList = async () => {
      if (failing) throw new Error('locked');
      return real();
    };
    const changed: number[] = [];
    const seen: { current?: ChapterLinks; state?: ChapterTrackState } = {};
    // As EnginePanel wires it: the change callback bumps the key that re-runs the hook's own read.
    function Probe() {
      const [key, setKey] = useState(0);
      seen.state = useChapterTrackState();
      seen.current = useChapterLinks(WIRE_TRACKS_PROJECT.tracks, key, () => {
        changed.push(1);
        setKey((n) => n + 1);
      });
      return null;
    }
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <Probe />
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    await waitFor(() => expect(seen.current?.mappings.length).toBeGreaterThan(0));
    const chapterId = seen.current!.mappings[0].chapterId;
    failing = true;
    await act(async () => seen.current!.unlink(chapterId));
    // The change was made and the re-read failed: said once, as a toast (#3365), never as a line in the page.
    await waitFor(() =>
      expect(overlay.getSnapshot().toasts.some((t) => t.text.includes('The change was made, but the list could not be read again'))).toBe(true),
    );
    expect(changed.length).toBeGreaterThan(0);
    // The read the callback re-ran also fails; that read wrote nothing, so the page keeps the host's own words.
    await act(async () => undefined);
    expect(seen.current?.error).not.toContain('The change was made');
    expect(seen.current?.error).not.toBe('');
    // The host recovers and the shared state reads the links again (its timer, a focus, the Refresh button): the line above the fresh list goes.
    failing = false;
    await act(async () => {
      await seen.state?.refreshLinks();
    });
    await waitFor(() => expect(seen.current?.error).toBe(''));
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
