import { flagged, isLow, itemAt, type ChapterDoc, type DocItem } from '../model';
import type { PageState } from '../script/scriptState';

type TintKind = 'extra' | 'low';

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

/** The paragraph the ribbon sits under: the cursor's, else the selection head's, else the playing word's. Null when none. */
export function activePid(doc: ChapterDoc, s: PageState): string | null {
  const pidOf = (key: string | null | undefined): string | null => (key && doc.index.has(key) ? doc.items[doc.index.get(key) as number].pid : null);
  return pidOf(s.cursor) ?? pidOf(s.sel?.head) ?? (s.playT == null ? null : (itemAt(doc, s.playT)?.pid ?? null));
}

/** What the ribbon draws for one paragraph. Null when the paragraph has no audio span. */
export function ribbonLayout(doc: ChapterDoc, pid: string, selected: readonly string[], playT: number | null): RibbonLayout | null {
  const para = doc.paras.find((p) => p.p.id === pid);
  if (!para || para.start == null || para.end == null || !(para.end > para.start)) return null;
  const { start: t0, end: t1 } = para;
  const clip = (a: number, b: number): { t0: number; t1: number } | null => (b < t0 || a > t1 ? null : { t0: Math.max(t0, a), t1: Math.min(t1, b) });
  const words = para.items.filter((i) => heard(i) && !i.cut);
  const ticks = words.map((i) => i.t0 as number);
  if (words.length) ticks.push(words[words.length - 1].t1 as number);

  const flagWords = flagged(doc).filter((i) => i.pid === pid);
  const tints = para.items.filter((i) => heard(i) && !i.cut && !i.accepted && (i.st === 'extra' || i.st === 'mis' || isLow(i)));
  const flags = tints.flatMap((i) => {
    const c = clip(i.t0 as number, i.t1 as number);
    return c ? [{ ...c, kind: (i.st === 'extra' ? 'extra' : 'low') as TintKind }] : [];
  });
  /* A cut word has no length of its own (it sits where the cut was), so one cut is one marker at that moment; the drawing gives it a visible width. */
  const cutIds = new Set<string>();
  const cuts = para.items.flatMap((i) => {
    if (!i.cut || !heard(i) || cutIds.has(i.cut)) return [];
    cutIds.add(i.cut);
    return clip(i.t0 as number, i.t1 as number) ?? [];
  });

  const picked = para.items.filter((i) => selected.includes(i.key) && heard(i) && !i.cut);
  const band = picked.length ? clip(picked[0].t0 as number, picked[picked.length - 1].t1 as number) : null;
  const playhead = playT != null && playT >= t0 && playT <= t1 ? playT : null;

  const count = flagWords.length;
  const description = [
    `The audio of this line, ${secs(t1 - t0)} long.`,
    `${count} flagged ${count === 1 ? 'word' : 'words'}${count ? `: ${flagWords.map((i) => i.text).join(', ')} (tinted, marked by a bar along the top)` : ''}.`,
    cuts.length ? `${cuts.length} cut ${cuts.length === 1 ? 'span' : 'spans'}, drawn hatched.` : '',
    band ? `Selection from ${secs(band.t0 - t0)} to ${secs(band.t1 - t0)}.` : '',
    playhead != null ? `Playing at ${secs(playhead - t0)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return { pid, t0, t1, ticks, flags, cuts, band, playhead, flagged: count, description };
}
