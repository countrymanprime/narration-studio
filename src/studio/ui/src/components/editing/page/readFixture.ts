import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import type { HeardAnswer, HeardWord } from '../../../ports/alignment';
import type { ChapterRead } from './chapterSource';

const ENGINE = { id: 'whisper:small', name: 'Whisper small' };

/** A chapter read as the ports answered it: `paragraphs` and the `words` heard, with no cuts, effects or tokens. A test sets what it needs on `workspace`. */
export function readFrom(paragraphs: Array<{ id: string; text: string }>, words: HeardWord[], workspace: Partial<WorkspaceAlignmentResult> = {}): ChapterRead {
  const answer: HeardAnswer = { heard: { engine: ENGINE, words } };
  return {
    workspace: {
      chapterId: 'c-1',
      state: 'current',
      reasons: [],
      needsAlignAgain: false,
      paragraphs,
      tokens: [],
      extras: [],
      items: [{ index: 0, itemGuid: 'item-0', live: true }],
      engine: ENGINE,
      ...workspace,
    },
    answer,
    cuts: [],
    effects: [],
    accepted: [],
    items: [],
    place: 'track',
    audio: { kind: 'ready' },
  };
}
