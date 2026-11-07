// The browser mock's Script prep states, kept in memory the way src/studio/desktop/internal/scriptprep keeps them: a chapter the manuscript
// lacks is refused, and the opening and closing credits are listed after the chapters once set. A word's pronunciation is not here: it is the
// Story Bible entry's (#2595).
import { PREP_STATES, SCRIPT_PREP_CREDITS_IDS } from './contracts/scriptPrep';
import type { ManuscriptChapter, PrepState, ScriptPrep, ScriptPrepApi } from '../types';
import { wireClone } from './mockFixtures';

export function createScriptPrepMock(ready: Promise<unknown>, chapters: () => ManuscriptChapter[]): ScriptPrepApi {
  const states = new Map<string, PrepState>();
  const hasChapter = (chapterId: string) => chapters().some((chapter) => chapter.id === chapterId);

  const list = (): ScriptPrep =>
    wireClone({
      chapters: [
        ...chapters().map((chapter) => ({ chapterId: chapter.id, state: states.get(chapter.id) ?? 'none' })),
        ...SCRIPT_PREP_CREDITS_IDS.flatMap((id) => {
          const state = states.get(id);
          return state ? [{ chapterId: id, state }] : [];
        }),
      ],
    });

  return {
    scriptPrepList: async () => {
      await ready;
      return list();
    },
    scriptPrepSetChapter: async (chapterId, state) => {
      await ready;
      if (!(PREP_STATES as readonly string[]).includes(state)) throw new Error('that is not a prep state');
      if (!SCRIPT_PREP_CREDITS_IDS.includes(chapterId) && !hasChapter(chapterId)) throw new Error('that chapter is not in the manuscript');
      if (state === 'none') states.delete(chapterId);
      else states.set(chapterId, state);
      return { chapterId, state };
    },
  };
}
