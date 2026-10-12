import type { WordFx } from '../../../api/contracts/wordFx';

/** A stored effect on `keys` of p-1, in original time `a` to `b`. */
export function wordFx(id: string, over: Partial<WordFx> = {}): WordFx {
  const keys = over.keys ?? ['p-1:0', 'p-1:1'];
  return {
    id,
    chapterId: 'chapter-1',
    pid: 'p-1',
    keys,
    text: 'The first',
    words: keys.map(() => ''),
    a: 10,
    b: 22,
    off0: 10,
    off1: 22,
    chainId: 'Podcast Voice.RfxChain',
    chainName: 'Podcast Voice',
    source: 'Your REAPER FX chains',
    fadeMs: 8,
    daw: 'REAPER',
    guid: `chapter-1/0-1/${id}`,
    at: '2026-10-12T00:00:00Z',
    paragraph: 0,
    stale: false,
    ...over,
  };
}

/** The chapter's length in the fixtures, in seconds. */
export const TOTAL = 200;

/** One effect over 6% of the chapter. */
export const ONE: WordFx[] = [wordFx('fx1')];
/** Two overlapping effects (10 to 22 and 20 to 30: 20 s together) and a third apart (100 to 104): 24 s, 12%, over the cap. */
export const MANY: WordFx[] = [
  wordFx('fx1'),
  wordFx('fx2', { keys: ['p-1:1', 'p-1:2'], text: 'first line', a: 20, b: 30, chainId: 'Warmth.RfxChain', chainName: 'Warmth' }),
  wordFx('fx3', { pid: 'p-2', keys: ['p-2:0'], text: 'Second', a: 100, b: 104, chainId: 'De-ess.RfxChain', chainName: 'De-ess' }),
];
