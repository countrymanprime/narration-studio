import { flagged, isLow, itemAt, runwayEnd, type ChapterDoc, type DocItem } from '../model';
import type { PageState } from '../script/scriptState';

/** Which kind of flagged word a tinted span covers: extra words, a misread, or a low-confidence word. */
export type TintKind = 'extra' | 'mis' | 'low';

export interface RibbonLayout {
  pid: string;
  /** The line's window, seconds on the document's clock. */
  t0: number;
  t1: number;
  /** A tick at the start of every heard word, and the end of the last. */
  ticks: number[];
  /** Spans of words the recogniser flagged. */
  flags: { t0: number; t1: number; kind: TintKind }[];
  /** Spans of words cut from the audio. */
  cuts: { t0: number; t1: number }[];
  band: { t0: number; t1: number } | null;
  playhead: number | null;
  flagged: number;
  /** The text alternative: the line's length, the flagged words, the cut spans. */
  description: string;
}

const heard = (i: DocItem): boolean => i.t0 != null && i.t1 != null && i.st !== 'miss';
const secs = (n: number): string => `${n.toFixed(1)} seconds`;

/**
 * The paragraph the ribbon sits under: the playing word's while playback runs (the ribbon follows the audio as the text advances), else the
 * cursor's, else the selection head's. Null when none.
 */
export function activePid(doc: ChapterDoc, s: PageState): string | null {
  const pidOf = (key: string | null | undefined): string | null => (key && doc.index.has(key) ? doc.items[doc.index.get(key) as number].pid : null);
  const playing = s.playT == null ? null : (itemAt(doc, s.playT)?.pid ?? null);
  return playing ?? pidOf(s.cursor) ?? pidOf(s.sel?.head);
}

/** The line's window on the document clock: its first word to a little past its last (the ramp-down), stopping short of the next line. Null when the paragraph has no audio span. */
export function lineWindow(doc: ChapterDoc, pid: string): { t0: number; t1: number } | null {
  const para = doc.paras.find((p) => p.p.id === pid);
  if (!para || para.start == null || para.end == null || !(para.end > para.start)) return null;
  const lastWord = para.items.filter(heard).at(-1);
  return { t0: para.start, t1: lastWord ? runwayEnd(doc, lastWord.key, para.end) : para.end };
}

/** What the ribbon draws for one paragraph. Null when the paragraph has no audio span. */
export function ribbonLayout(doc: ChapterDoc, pid: string, selected: readonly string[], playT: number | null): RibbonLayout | null {
  const win = lineWindow(doc, pid);
  const para = doc.paras.find((p) => p.p.id === pid);
  if (!win || !para) return null;
  const flagWords = flagged(doc).filter((i) => i.pid === pid);
  return layoutOf(pid, para.items, flagWords.length, flagWords, win.t0, win.t1, selected, playT, `The audio of this line, ${secs(win.t1 - win.t0)} long.`);
}

/**
 * What the waveform draws for any stretch `[t0, t1]` of the document clock, across as many lines as it reaches: the bottom waveform scrolls
 * the whole chapter. `pid` is the active line's, kept for the element that names it. Its text alternative names the stretch and the flagged
 * words in it.
 */
export function windowLayout(doc: ChapterDoc, t0: number, t1: number, selected: readonly string[], playT: number | null, pid = ''): RibbonLayout {
  const inside = (i: DocItem): boolean => i.t0 != null && i.t1 != null && i.t1 >= t0 && i.t0 <= t1;
  const items = doc.items.filter(inside);
  const flagWords = flagged(doc).filter((i) => inside(i) || (i.st === 'miss' && items.some((w) => w.pid === i.pid)));
  return layoutOf(pid, items, flagWords.length, flagWords, t0, t1, selected, playT, `The audio from ${clock(t0)} to ${clock(t1)}, ${secs(t1 - t0)}.`);
}

const clock = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function layoutOf(
  pid: string,
  items: readonly DocItem[],
  count: number,
  flagWords: readonly DocItem[],
  t0: number,
  t1: number,
  selected: readonly string[],
  playT: number | null,
  lead: string,
): RibbonLayout {
  const clip = (a: number, b: number): { t0: number; t1: number } | null => (b < t0 || a > t1 ? null : { t0: Math.max(t0, a), t1: Math.min(t1, b) });
  const words = items.filter((i) => heard(i) && !i.cut);
  const ticks = words.map((i) => i.t0 as number);
  if (words.length) ticks.push(words[words.length - 1].t1 as number);

  const tints = items.filter((i) => heard(i) && !i.cut && !i.accepted && (i.st === 'extra' || i.st === 'mis' || isLow(i)));
  const flags = tints.flatMap((i) => {
    const c = clip(i.t0 as number, i.t1 as number);
    return c ? [{ ...c, kind: (i.st === 'extra' ? 'extra' : i.st === 'mis' ? 'mis' : 'low') as TintKind }] : [];
  });
  /* A cut word has no length of its own (it sits where the cut was), so one cut is one marker at that moment; the drawing gives it a visible width. */
  const cutIds = new Set<string>();
  const cuts = items.flatMap((i) => {
    if (!i.cut || !heard(i) || cutIds.has(i.cut)) return [];
    cutIds.add(i.cut);
    return clip(i.t0 as number, i.t1 as number) ?? [];
  });

  const chosen = new Set(selected);
  const picked = items.filter((i) => chosen.has(i.key) && heard(i) && !i.cut);
  const band = picked.length ? clip(picked[0].t0 as number, picked[picked.length - 1].t1 as number) : null;
  const playhead = playT != null && playT >= t0 && playT <= t1 ? playT : null;

  const description = [
    lead,
    `${count} flagged ${count === 1 ? 'word' : 'words'}${count ? `: ${flagWords.map((i) => i.text).join(', ')} (tinted, marked by a bar along the top)` : ''}.`,
    cuts.length ? `${cuts.length} cut ${cuts.length === 1 ? 'span' : 'spans'}, drawn hatched.` : '',
    band ? `Selection from ${secs(band.t0 - t0)} to ${secs(band.t1 - t0)}.` : '',
    playhead != null ? `Playing at ${secs(playhead - t0)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return { pid, t0, t1, ticks, flags, cuts, band, playhead, flagged: count, description };
}
