// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { Track, TrackItem, TracksProject } from '../../../api/contracts/tracks';
import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import { ProjectTrackProviders } from '../../chapterTracks/ChapterTrackState';
import { useChapterSource } from './useChapterSource';

// #3366: the page already open follows the shared state. A chapter's track deleted or renamed in REAPER while the page is open reaches it on
// the state's next read (here, the window's focus), with no reopening of the chapter and no second read of its text.

const item: TrackItem = {
  guid: 'i1',
  position: 0,
  length: 10,
  name: 'i1',
  sourceKind: 'WAVE',
  sourceFile: 'i1.wav',
  sourceAvailable: true,
  supported: true,
  takeGuid: 't1',
  sourceStart: 0,
  playRate: 1,
};
const track = (name: string): Track => ({ guid: 'T', index: 0, name, color: '', muted: false, soloed: false, items: [item], depth: 0, isFolder: false });
const heard = (): WorkspaceAlignmentResult => ({
  chapterId: 'c1',
  state: 'current',
  reasons: [],
  needsAlignAgain: false,
  extras: [],
  items: [],
  paragraphs: [{ id: 'p1', text: 'one two' }],
  tokens: [],
});

describe('the Editing page follows the shared track state while it is open', () => {
  it('a renamed track changes the place, and a deleted one turns the audio into a missing track', async () => {
    let tracks: Track[] = [track('One')];
    let cutReads = 0;
    const api = createMockApi({
      chapterTrackMapList: async () => ({ documentId: 'doc', mappings: [{ trackGuid: 'T', chapterId: 'c1', chapterTitle: 'One', confirmedAt: '' }] }),
      tracksLive: async () => {
        const project: TracksProject = { path: 'Book.rpp', tracks };
        return { source: 'live' as const, reason: '' as const, message: '', readAt: '2026-11-11T00:00:00Z', project };
      },
      workspaceAlignment: async () => heard(),
      editingCutsList: async () => {
        cutReads += 1;
        return { chapterId: 'c1', cuts: [] };
      },
      dawProjectState: async () => ({ savedAt: '', unsavedChanges: false, playState: 'stopped' as const, playPosition: 0 }),
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <ProjectTrackProviders projectFolder="project" enabled notify={() => {}}>
          {children}
        </ProjectTrackProviders>
      </ApiProvider>
    );
    const { result } = renderHook(() => useChapterSource('c1', 'One'), { wrapper });
    const read = () => {
      const source = result.current.source;
      return source.status === 'ready' ? source.read : undefined;
    };
    await waitFor(() => expect(read()?.place).toBe('track “One”'));
    expect(read()?.audio.kind).toBe('ready');

    tracks = [track('Chapter 1')];
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(read()?.place).toBe('track “Chapter 1”'));

    tracks = [];
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(read()?.audio.kind).toBe('missing'));
    expect(cutReads).toBe(1);
  });
});
