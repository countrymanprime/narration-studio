// @vitest-environment jsdom
// The Kept take is the host-active take on every page (docs/research/ui-function-audit.md, cluster 3): Editing no longer waits for a keep made in
// this session, so after a reload it reads the same take Proof's spot marks Kept.
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { createJournal } from '../../../studio/journal/createJournal';
import { spotOf } from '../../proof/spot/spot';
import { useKeepTakes } from './keepTake';
import { measuredPassage } from './takeFixtures';

const journal = () => createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });

describe('the kept take after a reload', () => {
  it('is the host-active take in Editing and in Proof, with no keep made in this session', () => {
    const passage = measuredPassage();
    const active = passage.takes.find((t) => t.active);
    if (!active) throw new Error('the fixture has no active take');
    const { result } = renderHook(() => useKeepTakes(journal(), new Map([[passage.id, passage]])), {
      wrapper: ({ children }) => <ApiProvider api={createMockApi()}>{children}</ApiProvider>,
    });
    const spot = spotOf(
      {
        chapterId: passage.chapterId,
        passageId: passage.id,
        candidates: passage.takes.map((t) => ({ ...t, source: 'item_take', action: 'make_active', confirm: false, detail: '', itemGuid: '', takeGuid: '' })),
      } as never,
      { script: passage.script, at: 0 },
    );
    expect(spot?.takes.filter((t) => t.kept).map((t) => t.id)).toEqual([active.id]);
    expect(result.current.kept[passage.id]).toBe(active.id);
  });

  it('is not claimed for a line with a single take', () => {
    const passage = { ...measuredPassage(), takes: [measuredPassage().takes[0]] };
    const { result } = renderHook(() => useKeepTakes(journal(), new Map([[passage.id, passage]])), {
      wrapper: ({ children }) => <ApiProvider api={createMockApi()}>{children}</ApiProvider>,
    });
    expect(result.current.kept[passage.id]).toBeUndefined();
  });
});
