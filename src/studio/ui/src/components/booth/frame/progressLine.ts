import { WPH } from '../../schedule/estimates';

/** Where the narrator is in the chapter: the paragraph the current word sits in, and the words read over the words in all. */
export type BoothPlace = { paragraph: number; paragraphs: number; wordsRead: number; words: number };

/** Seconds as m:ss, or h:mm:ss from an hour. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * The top bar's progress line (the mock's `bprog`): "¶ 38 of 71 · 41% · ~8:10 finished left". The time left is the words still
 * to read at the standard rate, `WPH` words per finished hour, so it estimates finished audio, not the narrator's own speed.
 */
export function progressLine({ paragraph, paragraphs, wordsRead, words }: BoothPlace): string {
  const read = Math.min(Math.max(wordsRead, 0), words);
  const percent = words > 0 ? Math.floor((read / words) * 100) : 0;
  const secondsLeft = Math.round(((words - read) / WPH) * 3600);
  return `¶ ${paragraph.toLocaleString()} of ${paragraphs.toLocaleString()} · ${percent}% · ~${clock(secondsLeft)} finished left`;
}

/** The recording timer (the mock's `btimer`): mm:ss, h:mm:ss from an hour. */
export function timerText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = String(Math.floor((whole % 3600) / 60)).padStart(2, '0');
  const s = String(whole % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}
