/** The word a play of words ends on: its text and the recognizer's end time for it (seconds on the document's clock). */
export interface PlayedWord {
  text: string;
  end: number;
}

/** The most of a word the line carries: the host cuts a message at 2000 characters, and the numbers after the word must not be what is lost. */
const MAX_WORD_CHARS = 40;
/** The word as one safe token: no quote, backslash, control, format (direction marks) or separator (line and paragraph) character, and cut short. */
const safeWord = (text: string): string => {
  const clean = text.replace(/[\p{C}\p{Z}"\\]/gu, ' ');
  const chars = [...clean];
  return chars.length > MAX_WORD_CHARS ? `${chars.slice(0, MAX_WORD_CHARS).join('')}...` : clean;
};

const seconds = (t: number | null): string => (t === null ? 'unknown' : t.toFixed(3));

/**
 * The line `host.log` gets when a play of words ends (kind `play_stop`): the word, the recognizer's end for it, the time the play was planned to stop
 * at, the time it was stopped at where that is known (the app's audio position, or the last position the DAW sent: about four a second), the
 * difference in milliseconds and the path that played it (`app` or `daw`). A word heard clipped is traced here: a stop at or before the end of its
 * sound shows as a small `tail`.
 */
export function playStopLine({ word, planned, actual, path }: { word: PlayedWord; planned: number; actual: number | null; path: string }): string {
  const tail = Math.round((planned - word.end) * 1000);
  const late = actual === null ? 'unknown' : String(Math.round((actual - planned) * 1000));
  return `word="${safeWord(word.text)}" alignment_end=${seconds(word.end)} planned_stop=${seconds(planned)} tail_ms=${tail} actual_stop=${seconds(actual)} actual_minus_planned_ms=${late} path=${path}`;
}
