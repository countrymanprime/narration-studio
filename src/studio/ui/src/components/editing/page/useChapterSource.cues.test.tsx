// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { GuideDialogueCue } from '../../../api/contracts/storyBible';
import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import { ProjectTrackProviders } from '../../chapterTracks/ChapterTrackState';
import { useChapterSource } from './useChapterSource';

// The speakers view holds the cues that have been read, and the Script page reads them for the chapters it draws (#3766). This page reads
// its own chapter's: without that, a chapter opened here before the Script page drew it had no quotes and no speaker chips.

const heard = (): WorkspaceAlignmentResult => ({
  chapterId: 'c1',
  state: 'current',
  reasons: [],
  needsAlignAgain: false,
  extras: [],
  items: [],
  paragraphs: [{ id: 'p1', text: 'one two three' }],
  tokens: [],
});
const cue: GuideDialogueCue = {
  id: 'cue-1',
  chapterId: 'c1',
  paragraphId: 'p1',
  quote_start: 0,
  quote_end: 7,
  quote_text: 'one two',
  speaker_entity_id: null,
  speaker_source: 'unknown',
  evidence: { chapterId: 'c1', paragraphId: 'p1', excerpt: 'one two three', tag: '' },
  corrected: false,
};

describe('the Editing page reads the dialogue cues of its own chapter', () => {
  it('asks for that chapter only, never the book, and lays its quotes over the text', async () => {
    const cuesIn = vi.fn(async (chapterIds: readonly string[]) => (chapterIds.includes('c1') ? [cue] : []));
    const wholeBook = vi.fn(async () => [cue]);
    const api = createMockApi({
      workspaceAlignment: async () => heard(),
      guideDialogueCuesIn: cuesIn,
      guideDialogueCues: wholeBook,
    });
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
      expect(source.status === 'ready' && JSON.stringify(source.doc)).toContain('cue-1');
    });
    expect(cuesIn.mock.calls.map(([ids]) => [...ids])).toEqual([['c1']]);
    expect(wholeBook).not.toHaveBeenCalled();
  });
});
