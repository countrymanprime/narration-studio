// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { TrackMapping } from '../../types';
import { displacedSentence, useChapterLinkActions } from './useChapterLinkActions';

const mapping = (chapterId: string, chapterTitle: string): TrackMapping => ({ trackGuid: 'T', chapterId, chapterTitle, confirmedAt: '' });
const setAnswer = (displaced: TrackMapping | null) => ({ documentId: 'd', link: mapping('c1', 'One'), displaced, mappings: [mapping('c1', 'One')] });

function actionsWith(overrides: Parameters<typeof createMockApi>[0]) {
  const api = createMockApi(overrides);
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return renderHook(() => useChapterLinkActions(), { wrapper }).result.current;
}

describe('displacedSentence', () => {
  it('names the chapter by the manuscript when the caller knows it, else by the title the host kept, else says it is gone', () => {
    expect(displacedSentence(mapping('c2', 'Two'), () => 'Chapter 2')).toBe('Chapter 2 was linked to that track and is now not linked.');
    expect(displacedSentence(mapping('c2', ' Kept '), () => undefined)).toBe('Kept was linked to that track and is now not linked.');
    expect(displacedSentence(mapping('c2', '  '))).toBe('A chapter no longer in the manuscript was linked to that track and is now not linked.');
  });
});

describe('displacedSentence with hostile or empty names', () => {
  it('falls back to the kept title when the manuscript name is empty or blank', () => {
    expect(displacedSentence(mapping('c2', 'Kept'), () => '')).toBe('Kept was linked to that track and is now not linked.');
    expect(displacedSentence(mapping('c2', 'Kept'), () => '   ')).toBe('Kept was linked to that track and is now not linked.');
  });
  it('clips a long title, strips control and bidi characters, and does not throw on a non-string title', () => {
    expect(displacedSentence(mapping('c2', 'x'.repeat(10000))).length).toBeLessThan(140);
    expect(displacedSentence(mapping('c2', 'A\u202eB\nC\u0000D'))).toBe('A B C D was linked to that track and is now not linked.');
    expect(displacedSentence({ ...mapping('c2', ''), chapterTitle: 42 as unknown as string })).toBe(
      'A chapter no longer in the manuscript was linked to that track and is now not linked.',
    );
  });
});

describe('useChapterLinkActions', () => {
  it('set writes through the replacing binding and says who lost the track', async () => {
    const chapterTrackSet = vi.fn(async () => setAnswer(mapping('c2', 'Two')));
    const confirm = vi.fn();
    const actions = actionsWith({ chapterTrackSet, chapterTrackMapConfirm: confirm });
    const { displacedNotice } = await actions.set('c1', 'T');
    expect(chapterTrackSet).toHaveBeenCalledWith('c1', 'T');
    expect(confirm).not.toHaveBeenCalled();
    expect(displacedNotice).toBe('Two was linked to that track and is now not linked.');
    expect((await actions.set('c1', 'T')).linkedNotice).toBe('Track linked. Two was linked to that track and is now not linked.');
  });
  it('names the displaced chapter as the manuscript names it now, and keeps the kept title when the manuscript cannot be read', async () => {
    const chapters = [{ id: 'c2', title: 'Two', subtitle: 'The Pool' }];
    const named = actionsWith({ chapterTrackSet: async () => setAnswer(mapping('c2', 'Old title')), manuscriptChapters: async () => chapters as never });
    expect((await named.set('c1', 'T')).displacedNotice).toContain('Two');
    expect((await named.set('c1', 'T')).displacedNotice).not.toContain('Old title');
    const unread = actionsWith({
      chapterTrackSet: async () => setAnswer(mapping('c2', 'Old title')),
      manuscriptChapters: async () => {
        throw new Error('no manuscript');
      },
    });
    expect((await unread.set('c1', 'T')).displacedNotice).toBe('Old title was linked to that track and is now not linked.');
  });
  it('set has no notice when the track was free, and rejects with the host error', async () => {
    const free = actionsWith({ chapterTrackSet: async () => setAnswer(null) });
    const written = await free.set('c1', 'T');
    expect(written.displacedNotice).toBe('');
    expect(written.linkedNotice).toBe('Track linked.');
    const refused = actionsWith({
      chapterTrackSet: async () => {
        throw new Error('The project is not open.');
      },
    });
    await expect(refused.set('c1', 'T')).rejects.toThrow('The project is not open.');
  });
  it('set has no notice when the host answers the chapter just linked as the displaced one', async () => {
    const actions = actionsWith({ chapterTrackSet: async () => setAnswer(mapping('c1', 'One')) });
    expect((await actions.set('c1', 'T')).displacedNotice).toBe('');
  });
  it('unlink and create go to their own bindings', async () => {
    const chapterTrackUnlink = vi.fn(async () => ({ documentId: 'd', mappings: [] }));
    const chapterTrackCreate = vi.fn(async () => ({ outcome: 'refused' as const, reason: 'not_running' as const, message: 'No DAW.' }));
    const actions = actionsWith({ chapterTrackUnlink, chapterTrackCreate });
    expect((await actions.unlink('c1')).mappings).toEqual([]);
    expect((await actions.create('c1')).outcome).toBe('refused');
    expect(chapterTrackUnlink).toHaveBeenCalledWith('c1');
    expect(chapterTrackCreate).toHaveBeenCalledWith('c1');
  });
});
