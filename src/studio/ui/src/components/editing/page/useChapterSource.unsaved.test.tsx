// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { Track, TrackItem, TracksProject } from '../../../api/contracts/tracks';
import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { useChapterSource } from './useChapterSource';

// #3232: a take recorded into a nested Voice folder since the last save is in REAPER, not in the saved project the page reads. With the DAW holding
// unsaved changes the page says to save, never that nothing was recorded; with none it keeps saying the track is empty.

const item = (guid: string): TrackItem => ({
  guid,
  position: 0,
  length: 10,
  name: guid,
  sourceKind: 'WAVE',
  sourceFile: `${guid}.wav`,
  sourceAvailable: true,
  supported: true,
  takeGuid: `t-${guid}`,
  sourceStart: 0,
  playRate: 1,
});
const track = (guid: string, depth: number, isFolder: boolean, items: TrackItem[] = []): Track => ({
  guid,
  index: 0,
  name: guid,
  color: '',
  muted: false,
  soloed: false,
  items,
  depth,
  isFolder,
});
// An alignment that heard nothing and holds no live item: only the project's tracks can say the chapter has audio.
const unheard = (): WorkspaceAlignmentResult => ({
  chapterId: 'c1',
  state: 'current',
  reasons: [],
  needsAlignAgain: false,
  extras: [],
  items: [],
  paragraphs: [{ id: 'p1', text: 'one two' }],
  tokens: [],
});

function read(tracks: Track[], linked: string, unsavedChanges: boolean | 'refused' | 'hang') {
  const project: TracksProject = { path: 'Book.rpp', tracks };
  const api = createMockApi({
    chapterTrackMapList: async () => ({ documentId: 'doc', mappings: [{ trackGuid: linked, chapterId: 'c1', chapterTitle: 'One', confirmedAt: '' }] }),
    tracksList: async () => project,
    workspaceAlignment: async () => unheard(),
    dawProjectState: () =>
      unsavedChanges === 'hang'
        ? new Promise(() => {})
        : unsavedChanges === 'refused'
          ? Promise.reject(new Error('REAPER is not answering'))
          : Promise.resolve({ savedAt: '2026-11-10T01:00:00Z', unsavedChanges, playState: 'stopped' as const, playPosition: 0 }),
  });
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return renderHook(() => useChapterSource('c1', 'One'), { wrapper });
}

const audioOf = async (result: { current: ReturnType<typeof useChapterSource> }) => {
  await waitFor(() => expect(result.current.source.status).toBe('ready'));
  const source = result.current.source;
  if (source.status !== 'ready') throw new Error('not ready');
  return source.read.audio;
};

// Chapter 3 > [Narrator > [Main], Veyra]: the chapter folder, a voice that is a folder, and its leaf.
const nested = (): Track[] => [track('F', 0, true), track('Narrator', 1, true), track('Main', 2, false), track('Veyra', 1, false)];

describe('a chapter with nothing in the saved project while the DAW has unsaved changes', () => {
  it('a nested Voice folder is empty with unsaved set: the recording is waiting for a save', async () => {
    expect(await audioOf(read(nested(), 'F', true).result)).toEqual({ kind: 'empty', folder: true, unsaved: true });
  });

  it('a voice track added since the last save (the link is not in the saved project) is also a save to make, not a link to fix', async () => {
    expect(await audioOf(read(nested(), '{NEW}', true).result)).toEqual({ kind: 'empty', unsaved: true, missing: true });
  });

  it('with nothing unsaved the chapter is still empty, or missing, as before', async () => {
    expect(await audioOf(read(nested(), 'F', false).result)).toEqual({ kind: 'empty', folder: true });
    expect((await audioOf(read(nested(), '{NEW}', false).result)).kind).toBe('missing');
  });

  it('a DAW that cannot say whether it has unsaved changes is not taken to have none: the note says it could not tell', async () => {
    expect(await audioOf(read(nested(), 'F', 'refused').result)).toEqual({ kind: 'empty', folder: true, unsaved: 'unknown' });
  });

  it('a DAW that never answers does not hold the chapter: it reads after the wait, as could not tell', async () => {
    vi.useFakeTimers();
    try {
      const { result } = read(nested(), 'F', 'hang');
      await vi.advanceTimersByTimeAsync(3500);
      await vi.waitFor(() => expect(result.current.source.status).toBe('ready'));
      const source = result.current.source;
      expect(source.status === 'ready' && source.read.audio).toEqual({ kind: 'empty', folder: true, unsaved: 'unknown' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a flat chapter track is the same: empty with unsaved set when the DAW holds unsaved changes', async () => {
    expect(await audioOf(read([track('F', 0, false)], 'F', true).result)).toEqual({ kind: 'empty', unsaved: true });
    expect(await audioOf(read([track('F', 0, false)], 'F', false).result)).toEqual({ kind: 'empty' });
  });

  // A link the saved project lacks may be a track made since the last save, so with unsaved changes the note says to save; the relink dialog
  // is back once the project is saved and the track is still missing. A deleted track plus an unrelated edit takes that one extra step.
  it('a link to a track the saved project lacks, while the DAW has unsaved changes, asks for a save before it asks for a relink', async () => {
    expect((await audioOf(read([track('A', 0, false, [item('a1')])], '{GONE}', true).result)).kind).toBe('empty');
    expect((await audioOf(read([track('A', 0, false, [item('a1')])], '{GONE}', false).result)).kind).toBe('missing');
  });

  it('saved audio on a leaf is ready whatever the DAW holds', async () => {
    const tracks = [track('F', 0, true), track('Narrator', 1, true), track('Main', 2, false, [item('m1')])];
    expect((await audioOf(read(tracks, 'F', true).result)).kind).toBe('ready');
  });
});
