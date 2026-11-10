// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { Track, TrackItem, TracksProject } from '../../../api/contracts/tracks';
import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { useChapterSource } from './useChapterSource';

// The Editing page for a chapter linked to a folder of voices (the owner's #3041): the audio is on the folder's children, never on the folder.

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

function read(tracks: Track[], linked: string | null) {
  const project: TracksProject = { path: 'Book.rpp', tracks };
  const api = createMockApi({
    chapterTrackMapList: async () => ({
      documentId: 'doc',
      mappings: linked === null ? [] : [{ trackGuid: linked, chapterId: 'c1', chapterTitle: 'One', confirmedAt: '' }],
    }),
    tracksList: async () => project,
    workspaceAlignment: async () => unheard(),
  });
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return renderHook(() => useChapterSource('c1', 'One'), { wrapper });
}

const audioOf = async (result: { current: ReturnType<typeof useChapterSource> }) => {
  await waitFor(() => expect(result.current.source.status).toBe('ready'));
  const source = result.current.source;
  if (source.status !== 'ready') throw new Error('not ready');
  return source.read.audio.kind;
};

describe('the Editing page reads the chapter audio through the track it is linked to', () => {
  it('flat: a plain track with items is ready; with none it is empty', async () => {
    expect(await audioOf(read([track('A', 0, false, [item('a1')])], 'A').result)).toBe('ready');
    expect(await audioOf(read([track('A', 0, false)], 'A').result)).toBe('empty');
  });

  it('voice folders: the audio on the folder’s voices is the chapter’s audio', async () => {
    const tracks = [track('F', 0, true), track('Narrator', 1, false, [item('n1')]), track('Hero', 1, false)];
    const { result } = read(tracks, 'F');
    expect(await audioOf(result)).toBe('ready');
    const source = result.current.source;
    expect(source.status === 'ready' && source.read.items.map((i) => i.guid)).toEqual(['n1']);
  });

  it('nested folders: a folder inside the chapter folder counts', async () => {
    const tracks = [track('F', 0, true), track('Crowd', 1, true), track('G1', 2, false, [item('g1')]), track('Next', 0, false, [item('x')])];
    expect(await audioOf(read(tracks, 'F').result)).toBe('ready');
  });

  it('an empty folder is empty (the link is fine, nothing is recorded), not missing, and says it is a folder', async () => {
    const empty = read([track('F', 0, true), track('V', 1, false)], 'F');
    expect(await audioOf(empty.result)).toBe('empty');
    const source = empty.result.current.source;
    expect(source.status === 'ready' && source.read.audio).toEqual({ kind: 'empty', folder: true });
    expect(await audioOf(read([track('F', 0, true)], 'F').result)).toBe('empty');
  });

  it('another chapter’s audio is not this chapter’s: a folder with no items next to a track that has some is still empty', async () => {
    expect(await audioOf(read([track('F', 0, true), track('V', 1, false), track('Next', 0, false, [item('x')])], 'F').result)).toBe('empty');
  });

  it('a link to a track the project no longer has is missing; no link is unlinked', async () => {
    expect(await audioOf(read([track('A', 0, false, [item('a1')])], 'gone').result)).toBe('missing');
    expect(await audioOf(read([track('A', 0, false, [item('a1')])], null).result)).toBe('unlinked');
  });

  it('the Voice folders mock (?mockVoiceFolders=1): Chapter 1 is linked to its folder and the Narrator voice’s take is the chapter’s audio, before any check has run', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result } = renderHook(() => useChapterSource('chapter-1', 'Chapter 1'), { wrapper });
    expect(await audioOf(result)).toBe('ready');
    const source = result.current.source;
    expect(source.status === 'ready' && source.read.items).toHaveLength(1);
  });

  it('a book folder holding chapter folders whose voices are folders of takes: each chapter, and the book, has its audio', async () => {
    const tracks = [
      track('Book', 0, true),
      track('Ch1', 1, true),
      track('Narrator', 2, true),
      track('N-take', 3, false, [item('n1')]),
      track('Hero', 2, true),
      track('H-take', 3, false),
      track('Ch2', 1, true),
      track('Narr2', 2, false, [item('x')]),
    ];
    expect(await audioOf(read(tracks, 'Ch1').result)).toBe('ready');
    expect(await audioOf(read(tracks, 'Ch2').result)).toBe('ready');
    expect(await audioOf(read(tracks, 'Book').result)).toBe('ready');
  });
});
