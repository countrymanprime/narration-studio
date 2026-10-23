import { HEADING_PARAGRAPH, type HeardAnswer, type HeardWord as PortWord } from '../../../ports/alignment';
import { buildDoc, type Aligner, type ChapterDoc, type ChapterInput, type Heard, type HeardWord, type ScriptParagraph } from '../model';

/** A quoted stretch of a paragraph: UTF-16 offsets into its text, and the cue it is the quote of. */
export interface QuotedPhrase {
  cue: string;
  start: number;
  end: number;
}

/** A paragraph of the chapter as the workspace port gives it, with the quotes the Story Bible found in it. */
export interface TextParagraph {
  id: string;
  text: string;
  phrases?: readonly QuotedPhrase[];
}

/** Seconds of lead-in before a stretch's first word, so the model's offsets begin just after zero. */
const LEAD = 0.15;

/**
 * The units of a paragraph: its quotes and the narration around them. A boundary is moved out to the whitespace around the word it fell in, so
 * the words of the paragraph are the same whole-text words with or without quotes (a word's key is its number in the paragraph).
 */
export function unitsOf(p: TextParagraph): ScriptParagraph['units'] {
  const text = p.text;
  const isSpace = (at: number): boolean => /\s/.test(text[at] ?? ' ');
  const back = (at: number): number => {
    let i = Math.min(Math.max(at, 0), text.length);
    while (i > 0 && i < text.length && !isSpace(i) && !isSpace(i - 1)) i--;
    return i;
  };
  const forward = (at: number): number => {
    let i = Math.min(Math.max(at, 0), text.length);
    while (i > 0 && i < text.length && !isSpace(i) && !isSpace(i - 1)) i++;
    return i;
  };
  const quotes: Array<{ cue: string; s: number; e: number }> = [];
  let floor = 0;
  for (const q of [...(p.phrases ?? [])].sort((a, b) => a.start - b.start)) {
    const s = Math.max(back(q.start), floor);
    const e = forward(q.end);
    if (e <= s || !text.slice(s, e).trim()) continue;
    quotes.push({ cue: q.cue, s, e });
    floor = e;
  }
  if (!quotes.length) return [{ key: `${p.id}:u0`, s: 0, e: text.length }];
  const out: ScriptParagraph['units'] = [];
  let at = 0;
  const add = (s: number, e: number, cue?: string): void => {
    if (e > s) out.push({ key: `${p.id}:u${out.length}`, s, e, ...(cue ? { cue } : {}) });
  };
  for (const q of quotes) {
    add(at, q.s);
    add(q.s, q.e, q.cue);
    at = q.e;
  }
  add(at, text.length);
  return out;
}

/** The cursor steps by unit: a quote or the narration between quotes, and a whole paragraph where it has no quote (the mock steps by phrase). */
const toScriptParagraph = (p: TextParagraph): ScriptParagraph => ({
  id: p.id,
  text: p.text,
  units: unitsOf(p),
  ...(p.id === HEADING_PARAGRAPH ? { optional: true } : {}),
});

/**
 * The port's words, grouped by the paragraph they were heard in: a word said and not in the script goes with the script word before it, except
 * a restart (a run that says the script words after it again), which goes with the script word after it, the line it restarts.
 */
export function groupByParagraph<W extends Pick<PortWord, 'paragraphId' | 'repeats'>>(words: readonly W[], first: string | undefined): Map<string, W[]> {
  const out = new Map<string, W[]>();
  let current = first;
  words.forEach((w, k) => {
    if (w.paragraphId !== undefined) current = w.paragraphId;
    const restarts = w.paragraphId === undefined && w.repeats === 'next' ? words.slice(k + 1).find((n) => n.paragraphId !== undefined)?.paragraphId : undefined;
    const pid = restarts ?? current;
    if (pid === undefined) return;
    out.set(pid, [...(out.get(pid) ?? []), w]);
  });
  return out;
}

/** The model's `Aligner` over what the port heard; a word the recogniser did not score counts as sure. */
function alignerFor(heard: NonNullable<Extract<HeardAnswer, { heard: unknown }>['heard']>, paragraphs: readonly TextParagraph[]): Aligner {
  // A word heard before anything of the script goes with the first paragraph of the body, never the heading.
  const byPara = groupByParagraph(heard.words, paragraphs.find((p) => p.id !== HEADING_PARAGRAPH)?.id);
  return {
    engine: () => heard.engine,
    snap: (sec) => sec,
    heard({ id }): Heard | null {
      // The recogniser ran on the chapter, so a paragraph it heard nothing in is a paragraph not read, not one never transcribed.
      const own = byPara.get(id);
      if (!own?.length) return { words: [], len: LEAD };
      const origin = own[0].off0 - LEAD;
      const words: HeardWord[] = own.map((w) => ({
        text: w.text,
        off0: Math.max(0, w.off0 - origin),
        off1: Math.max(0, w.off1 - origin),
        conf: w.conf ?? 1,
        ...(w.added ? { added: true } : {}),
        ...(w.repeats ? { repeats: w.repeats } : {}),
      }));
      return { words, len: words[words.length - 1].off1 + LEAD };
    },
  };
}

const NOT_HEARD: Aligner = { engine: () => ({ id: '', name: '' }), snap: (s) => s, heard: () => null };

/** The chapter's document: its text set against what was heard, or plain text when the port answered null. Cuts and effects arrive with SN-E62 and SN-E63; until then the page passes none. */
export function docFromHeard(
  paragraphs: readonly TextParagraph[],
  answer: HeardAnswer,
  extras: Partial<Pick<ChapterInput, 'cuts' | 'effects' | 'accepted'>> = {},
): ChapterDoc {
  const aligner = answer.heard ? alignerFor(answer.heard, paragraphs) : NOT_HEARD;
  return buildDoc({ paragraphs: paragraphs.map(toScriptParagraph), aligner, cuts: [], effects: [], accepted: [], ...extras });
}
