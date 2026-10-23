/** The selection model and what a selection comes to: a run of whole words in the order of the text, with a time range to cut or treat. */
import { origTime, type CutSpan } from './cuts';
import { flagged, isLow, r3, type ChapterDoc, type DocItem, type ScriptParagraph } from './doc';

export interface Sel {
  anchor: string;
  head: string;
}

/** The keys between two words, both included, in the order of the text. */
export function rangeKeys(doc: ChapterDoc, a: string, z: string): string[] {
  const i = doc.index.get(a);
  const j = doc.index.get(z);
  if (i == null || j == null) return [];
  return doc.items.slice(Math.min(i, j), Math.max(i, j) + 1).map((x) => x.key);
}
export const selKeys = (doc: ChapterDoc, sel: Sel | null): string[] => (sel ? rangeKeys(doc, sel.anchor, sel.head) : []);

/** The word a step of `d` words from `key` lands on; the first or last word at the ends. */
export function stepKey(doc: ChapterDoc, key: string | null, d: number): string | null {
  if (!doc.items.length) return null;
  const i = key == null ? (d > 0 ? -1 : doc.items.length) : (doc.index.get(key) ?? 0);
  return doc.items[Math.max(0, Math.min(doc.items.length - 1, i + d))].key;
}

/** The first word of the next (or previous) phrase. */
export function stepPhrase(doc: ChapterDoc, key: string | null, d: 1 | -1): string | null {
  if (!doc.items.length) return null;
  const i = key == null ? 0 : (doc.index.get(key) ?? 0);
  const u = doc.items[i].uKey;
  if (d > 0) return (doc.items.slice(i + 1).find((x) => x.uKey !== u) ?? doc.items[doc.items.length - 1]).key;
  const startOfThis = doc.items.findIndex((x) => x.uKey === u);
  if (startOfThis < i) return doc.items[startOfThis].key;
  const prev = doc.items[Math.max(0, startOfThis - 1)].uKey;
  return doc.items[doc.items.findIndex((x) => x.uKey === prev)].key;
}

/** The next (d = 1) or previous flagged word after `key`, wrapping at the ends; null when there is none. */
export function stepFlag(doc: ChapterDoc, key: string | null, d: 1 | -1): string | null {
  const list = flagged(doc);
  if (!list.length) return null;
  const at = key == null ? -1 : (doc.index.get(key) ?? -1);
  const pick = d > 0 ? list.find((x) => (doc.index.get(x.key) ?? 0) > at) : [...list].reverse().find((x) => (doc.index.get(x.key) ?? 0) < at);
  return (pick ?? (d > 0 ? list[0] : list[list.length - 1])).key;
}

/** The word that is playing at `t` (seconds now), or the last one that began before it. */
export function itemAt(doc: ChapterDoc, t: number): DocItem | null {
  let hit: DocItem | null = null;
  for (const i of doc.items) {
    if (i.t0 == null || i.cut || i.st === 'miss') continue;
    if (i.t0 <= t + 1e-6) hit = i;
    else break;
  }
  return hit;
}

/** The first word that is heard at or after the cursor's word. */
export const firstFrom = (doc: ChapterDoc, key: string | null): DocItem | null => {
  const i = key == null ? 0 : (doc.index.get(key) ?? 0);
  return doc.items.slice(i).find((x) => x.t0 != null && !x.cut && x.st !== 'miss') ?? null;
};

export interface Range {
  pid: string;
  takeId?: string;
  keys: string[];
  items: DocItem[];
  /** Seconds now, snapped to a zero crossing. */
  start: number;
  end: number;
  /** The same range as seconds from the start of the take or the paragraph, before any cut. */
  off0: number;
  off1: number;
  /** Where the audio sat before any cut. */
  a: number;
  b: number;
  text: string;
}
export interface SelSummary {
  items: DocItem[];
  /** Words that have audio and are not cut. */
  audible: DocItem[];
  /** One range for each paragraph the selection touches. */
  ranges: Range[];
  /** Seconds the audio spans across all ranges. */
  len: number;
  start: number;
  end: number;
  low: number;
  /** Every selected word was said and is not in the script. */
  allExtra: boolean;
  hasCut: boolean;
  hasFx: boolean;
  words: string;
}

/** The words as they sound: what was heard where the script was misread. */
const spoken = (i: DocItem): string => (i.st === 'mis' && i.heard ? i.heard : i.text);
const joinWords = (items: DocItem[]): string =>
  items
    .map(spoken)
    .join(' ')
    .replace(/[,;:]$/, '');

/** What a run of keys comes to. `cuts` are the chapter's, `snap` moves a time to a zero crossing, `padMs` moves both ends inward. */
export function summarize(doc: ChapterDoc, keys: string[], cuts: readonly CutSpan[], snap: (sec: number) => number, padMs = 0): SelSummary {
  const items = keys.map((k) => doc.items[doc.index.get(k) ?? -1]).filter((i): i is DocItem => !!i);
  const audible = items.filter((i) => !i.cut && i.st !== 'miss' && i.t0 != null);
  const groups = new Map<string, DocItem[]>();
  audible.forEach((i) => {
    const g = i.pid + '|' + (i.takeId ?? '');
    groups.set(g, [...(groups.get(g) ?? []), i]);
  });
  const pad = padMs / 1000;
  const ranges: Range[] = [...groups.values()].map((g) => {
    const first = g[0];
    const last = g[g.length - 1];
    const start = snap((first.t0 as number) + pad);
    const end = Math.max(start + 0.01, snap((last.t1 as number) - pad));
    return {
      pid: first.pid,
      takeId: first.takeId,
      keys: g.map((x) => x.key),
      items: g,
      start,
      end,
      off0: r3((first.off0 as number) + pad),
      off1: r3((last.off1 as number) - pad),
      a: r3(origTime(cuts, start)),
      b: r3(origTime(cuts, end)),
      text: joinWords(g),
    };
  });
  return {
    items,
    audible,
    ranges,
    len: r3(ranges.reduce((a, r) => a + (r.end - r.start), 0)),
    start: ranges.length ? Math.min(...ranges.map((r) => r.start)) : 0,
    end: ranges.length ? Math.max(...ranges.map((r) => r.end)) : 0,
    low: audible.filter(isLow).length,
    allExtra: items.length > 0 && items.every((i) => i.st === 'extra'),
    hasCut: items.some((i) => i.cut),
    hasFx: items.some((i) => i.fx.length > 0),
    words: joinWords(audible.length ? audible : items),
  };
}

/** Where the audio after a range goes when the gap is closed: the first later word and when it sounds now and afterwards. */
export function laterAudio(doc: ChapterDoc, r: Range): { before: number; after: number } | null {
  const last = r.items[r.items.length - 1];
  const at = doc.index.get(last.key);
  if (at == null) return null;
  const next = doc.items.slice(at + 1).find((x) => x.t0 != null && !x.cut && x.st !== 'miss');
  return next ? { before: next.t0 as number, after: r3((next.t0 as number) - (r.end - r.start)) } : null;
}

/** The characters of a paragraph that a run of its script words covers, for a note or a mark. Words that were only said are left out. */
export function scriptSpan(p: ScriptParagraph, items: DocItem[]): { pid: string; s: number; e: number; q: string } | null {
  const words = items.filter((i) => i.kind === 'w' && i.pid === p.id).map((i) => Number(i.key.split(':')[1]));
  if (!words.length) return null;
  const spans = [...p.text.matchAll(/\S+/g)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const);
  const s = spans[Math.min(...words)]?.[0];
  const e = spans[Math.max(...words)]?.[1];
  return s == null || e == null ? null : { pid: p.id, s, e, q: p.text.slice(s, e) };
}
