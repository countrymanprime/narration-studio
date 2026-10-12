import { useCallback } from 'react';
import type { ChapterNameInput } from '../../../../chapterName';
import { useScriptCommands } from '../data/useScriptData';

/**
 * The reader's Left and Right arrows: steps the prep state of the chapter in view back or forward, stopping at either end. It answers
 * whether the key was one it handles, so the reader stops the key's default (scrolling sideways) only then.
 */
export function useStepPrepFromKey(): (chapterInView: (ChapterNameInput & { id: string }) | undefined, key: string) => boolean {
  const { stepPrep } = useScriptCommands();
  return useCallback(
    (chapterInView, key) => {
      const delta = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
      if (!delta || !chapterInView) return false;
      void stepPrep(chapterInView, delta);
      return true;
    },
    [stepPrep],
  );
}
