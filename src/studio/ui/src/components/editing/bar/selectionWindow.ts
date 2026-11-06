import { heardWindow, MAX_TAIL_SECONDS, summarize, type ChapterDoc } from '../model';
import type { SoundAt } from '../ribbon/useChapterSound';
import { selectedKeysOf, type PageState } from '../script/scriptState';
import type { PlayedWord } from './playStopLine';

/** The stretch the selected words are heard over and the word it ends on, or null when none of them was recorded. */
export const selectionWindow = (d: ChapterDoc, s: PageState, sound?: SoundAt): { window: [number, number]; last: PlayedWord } | null => {
  const keys = selectedKeysOf(d, s);
  const sum = summarize(d, keys, [], (x) => x);
  if (!sum.audible.length) return null;
  // The levels from the first word to as far past the last as a play may run: the end is where the last word's sound dies away.
  const levels = sound?.(sum.start, sum.end + MAX_TAIL_SECONDS + 0.1);
  const last = sum.audible[sum.audible.length - 1];
  return { window: heardWindow(d, sum.audible[0].key, last.key, sum.start, sum.end, levels), last: { text: last.text, end: sum.end } };
};
