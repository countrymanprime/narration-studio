// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { PassageMark } from '../../../api/contracts/passageMap';
import type { PassageTake, WorkspaceAlignmentResult, WorkspaceTakesResult } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { mapPassages } from '../../../api/passageMapSpans';
import { useLines } from './useLines';

// Three lines the alignment heard none of: the chapter was recorded in the Booth, so its passage map is all Editing has.
const PARAS = [
  { id: 'p1', text: 'one two three four' },
  { id: 'p2', text: 'five six seven eight' },
  { id: 'p3', text: 'nine ten eleven twelve' },
];

function unheard(): WorkspaceAlignmentResult {
  let i = 0;
  const tokens = PARAS.flatMap((p) => p.text.split(' ').map((text, w) => ({ i: i++, p: p.id, w, text, status: 'skip' as const })));
  return { chapterId: 'c1', state: 'current', reasons: [], needsAlignAgain: false, extras: [], items: [], paragraphs: PARAS, tokens };
}

const mark = (
  id: string,
  kind: PassageMark['kind'],
  pid: string,
  word: number,
  sec: number,
  take: string,
  prev?: { pid: string; word: number },
): PassageMark => ({
  id,
  run: 'c1.1',
  chapterId: 'c1',
  pid,
  word,
  sec,
  kind,
  ...(prev ? { prev } : {}),
  itemGuid: '{ITEM}',
  takeGuid: take,
  stale: false,
});

// Take 1 reads p1 whole and the first word of p2, then the narrator rolls back to the start of p2 and take 2 reads it to the end.
const ROLLED_BACK = [
  mark('c1.1.0', 'start', 'p1', 0, 0, '{T1}'),
  mark('c1.1.1', 'roll', 'p2', 0, 12, '{T2}', { pid: 'p2', word: 1 }),
  mark('c1.1.2', 'stop', 'p2', 4, 20, '{T2}', { pid: 'p2', word: 4 }),
];

const candidate = (take: string): PassageTake => ({
  id: `take:{ITEM}:${take}`,
  source: 'item_take',
  action: 'make_active',
  confirm: false,
  label: take,
  detail: '',
  active: take === '{T2}',
  itemGuid: '{ITEM}',
  takeGuid: take,
  sourceFile: 'c1.wav',
  sourceStart: 0,
  sourceLength: 8,
  usable: true,
  compared: false,
});

function setup(marks: PassageMark[] | Error) {
  const asked: number[][] = [];
  const workspaceTakes = vi.fn(async (chapterId: string, firstToken: number, lastToken: number): Promise<WorkspaceTakesResult> => {
    asked.push([firstToken, lastToken]);
    return {
      chapterId,
      firstToken,
      lastToken,
      firstParagraph: 1,
      lastParagraph: 1,
      words: lastToken - firstToken + 1,
      passageId: 'passage-p2',
      itemGuid: '{ITEM}',
      candidates: [candidate('{T1}'), candidate('{T2}')],
    };
  });
  const passageMapList = vi.fn(async () => {
    if (marks instanceof Error) throw marks;
    return marks;
  });
  const api = createMockApi({ workspaceTakes, passageMapList });
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  const ws = unheard();
  return { asked, workspaceTakes, passageMapList, ...renderHook(() => useLines('c1', ws), { wrapper }) };
}

describe('useLines reads the Booth’s passage map', () => {
  it('a paragraph covered by two takes and a roll back come from the marks', async () => {
    expect([...mapPassages(ROLLED_BACK, PARAS)]).toEqual(['p2']);
    const { result, asked, passageMapList } = setup(ROLLED_BACK);
    await waitFor(() => expect(result.current.byId.size).toBe(1));
    expect(passageMapList).toHaveBeenCalledWith('c1');
    // Only p2 is asked: p1 was read by one take and p3 by none, and the alignment heard nothing.
    expect(asked).toEqual([[4, 7]]);
    const line = result.current.byId.get('p2')!;
    expect(line.takes.map((t) => t.id)).toEqual(['take:{ITEM}:{T1}', 'take:{ITEM}:{T2}']);
    expect(result.current.passageIds.get('passage-p2')).toBe('p2');
  });

  it('a stale mark, or a map that cannot be read, works out no passage', async () => {
    expect(mapPassages([ROLLED_BACK[0], { ...ROLLED_BACK[1], stale: true, staleReason: 'word_out_of_range' }, ROLLED_BACK[2]], PARAS).size).toBe(0);
    for (const marks of [[], new Error('your passage map file could not be read')]) {
      const { result, workspaceTakes, passageMapList } = setup(marks);
      await waitFor(() => expect(passageMapList).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(workspaceTakes).not.toHaveBeenCalled();
      expect(result.current.byId.size).toBe(0);
    }
  });
});
