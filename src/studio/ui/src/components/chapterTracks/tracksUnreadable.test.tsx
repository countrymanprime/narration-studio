// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { PickupItem } from '../../api/contracts/pickups';
import type { WorkspaceAlignmentResult } from '../../api/contracts/workspace';
import { DAW_SETUPS } from '../../fixtures/daw';
import { createMockDawClient } from '../../ports/daw';
import type { DawClient } from '../../ports/index';
import { PortOverrides } from '../../ports/usePort';
import { audioOf } from '../editing/page/chapterSource';
import { useChapterSource } from '../editing/page/useChapterSource';
import { noAudioText } from '../editing/page/noAudioText';
import { usePlayOriginal } from '../pickups/list/usePlayOriginal';
import { ProjectTrackProviders } from './ChapterTrackState';
import { tracksUnreadable } from './chapterLink';

afterEach(cleanup);

// #3394 item 1: when the shared track state's first read fails, every page that needs the tracks says the same sentence. Proof's row is in
// ProofPage.test.tsx (it draws in the timeline slot). Nothing here may spell the sentence itself: it comes from `tracksUnreadable`.
const SENTENCE = 'The tracks could not be read: REAPER did not answer.';

const failing = () =>
  createMockApi({
    chapterTrackMapList: async () => ({ documentId: 'doc', mappings: [] }),
    tracksLive: async () => {
      throw new Error('REAPER did not answer.');
    },
    workspaceAlignment: async (): Promise<WorkspaceAlignmentResult> => ({
      chapterId: 'c1',
      state: 'current',
      reasons: [],
      needsAlignAgain: false,
      extras: [],
      items: [],
      paragraphs: [{ id: 'p1', text: 'one two' }],
      tokens: [],
    }),
    dawProjectState: async () => ({ savedAt: '', unsavedChanges: false, playState: 'stopped' as const, playPosition: 0 }),
  });

const pickup: PickupItem = {
  id: 'p1',
  chapterId: 'c1',
  paragraphId: null,
  paragraph: null,
  time: 20,
  at: 15,
  type: 'misread',
  script: 'Garden',
  context: 'Garden',
  source: 'you',
  confidence: null,
  confReason: '',
  included: true,
  done: false,
  waiting: false,
};

describe('the one sentence for a first tracks read that failed', () => {
  it('is the helper’s: only when there is no project and an error', () => {
    expect(tracksUnreadable({ project: undefined, live: { error: 'REAPER did not answer.' } })).toBe(SENTENCE);
    expect(tracksUnreadable({ project: undefined, live: { error: '' } })).toBeNull();
    // An earlier read still shown is the Saved project mark and "Last read", not this sentence.
    expect(tracksUnreadable({ project: { path: 'a.rpp', tracks: [] }, live: { error: 'REAPER did not answer.' } })).toBeNull();
  });

  // qa-breaker (#3586): the host's words are cut, so a 10,000-character message cannot fill the slot of any page that shows the sentence.
  it('cuts a huge host message, for every page at once', () => {
    const huge = tracksUnreadable({ project: undefined, live: { error: 'x'.repeat(10_000) } }) ?? '';
    expect(huge.startsWith('The tracks could not be read: xxx')).toBe(true);
    expect(huge.length).toBeLessThan(260);
    expect(huge.endsWith('…')).toBe(true);
  });

  it('Editing: the note over the script says it, and nothing plays', async () => {
    const api = failing();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <ProjectTrackProviders projectFolder="project" enabled notify={() => {}}>
          {children}
        </ProjectTrackProviders>
      </ApiProvider>
    );
    const { result } = renderHook(() => useChapterSource('c1', 'One'), { wrapper });
    await waitFor(() => {
      const source = result.current.source;
      expect(source.status === 'ready' && source.read.audio.kind).toBe('unreadable');
    });
    const source = result.current.source;
    if (source.status !== 'ready' || source.read.audio.kind === 'ready') throw new Error('expected a read with no audio');
    expect(noAudioText(source.read.audio, 'One', 'REAPER').headline).toBe(SENTENCE);
  });

  it('Pickups: Hear the original says it when pressed', async () => {
    const api = failing();
    const caps = DAW_SETUPS['reaper-off'];
    const daw: DawClient = { ...createMockDawClient(caps), capabilities: async () => caps };
    const refused: string[] = [];
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <PortOverrides clients={{ daw }}>
          <ProjectTrackProviders projectFolder="project" enabled notify={() => {}}>
            {children}
          </ProjectTrackProviders>
        </PortOverrides>
      </ApiProvider>
    );
    const { result } = renderHook(() => usePlayOriginal((text) => refused.push(text)), { wrapper });
    // The shared state reads after the page mounts; a press on a first read that failed refuses with the sentence.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await act(() => result.current.play(pickup));
    await waitFor(() => expect(refused.join(' ')).toContain(SENTENCE));
  });

  // The page keeps playing what the alignment names in the project, and keeps what it has when a later read fails.
  it('Editing: a chapter whose alignment names live items stays ready, and so does one whose read failed after a good one', async () => {
    expect(audioOf('unknown', 0, 3, false, false, SENTENCE).kind).toBe('ready');
    expect(audioOf('unknown', 0, 0, false, false, SENTENCE).kind).toBe('unreadable');
    let reads = 0;
    const api = createMockApi({
      chapterTrackMapList: async () => ({ documentId: 'doc', mappings: [{ trackGuid: 'T', chapterId: 'c1', chapterTitle: 'One', confirmedAt: '' }] }),
      tracksLive: async () => {
        reads += 1;
        if (reads > 1) throw new Error('REAPER did not answer.');
        const item = {
          guid: 'i',
          position: 0,
          length: 10,
          name: 'i',
          sourceKind: 'WAVE',
          sourceFile: 'i.wav',
          sourceAvailable: true,
          supported: true,
          takeGuid: 't',
          sourceStart: 0,
          playRate: 1,
        };
        return {
          source: 'live' as const,
          reason: '' as const,
          message: '',
          readAt: '2026-11-11T00:00:00Z',
          revision: '',
          project: {
            path: 'Book.rpp',
            tracks: [{ guid: 'T', index: 0, name: 'One', color: '', muted: false, soloed: false, items: [item], depth: 0, isFolder: false }],
          },
        };
      },
      workspaceAlignment: failing().workspaceAlignment,
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
    const kind = () => {
      const source = result.current.source;
      return source.status === 'ready' ? source.read.audio.kind : undefined;
    };
    await waitFor(() => expect(kind()).toBe('ready'));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(kind()).toBe('ready');
  });
});
