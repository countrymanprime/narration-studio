import type { HeardAnswer, HeardWord as PortWord } from '../../../ports/alignment';
import type { ParagraphNote, WordDecoration } from '../../booth/reading/boothUnits';
import { snapToWordBoundary } from '../../booth/reading/boothUnits';
import type { EntityColour } from '../../../kinds/entityColour';
import { buildDoc, type Aligner, type ChapterDoc, type ChapterInput, type Heard, type HeardWord, type ScriptParagraph, type ScriptUnit } from '../model';

/** A paragraph of the chapter as the workspace port gives it. */
export interface TextParagraph {
  id: string;
  text: string;
}

/** Seconds of lead-in before a stretch's first word, so the model's offsets begin just after zero. */
const LEAD = 0.15;

/** A quotation in a line: the characters it covers, who speaks it and in what colour (the speaker's own, none for a speaker the Story Bible lacks). */
export interface DecorPhrase {
  start: number;
  end: number;
  speaker: string;
  /** The narrator confirmed the speaker. */
  confirmed: boolean;
  colour?: EntityColour;
}

/** What the Story Bible and the Script's marks add to the text: the quoted phrases of each line, the words to underline and the notes under a line. */
export interface ScriptDecor {
  /** The quoted phrases of each paragraph, by its id (the Story Bible's dialogue cues). */
  phrases: ReadonlyMap<string, readonly DecorPhrase[]>;
  decorations: readonly WordDecoration[];
  notes: readonly ParagraphNote[];
}

/**
 * The units of a paragraph, the stretches the cursor steps by: each quotation with its speaker, and the narration between. A paragraph with no
 * quotation is one unit. A cue whose range lies outside the text, or overlaps one before it, is left out; the edges snap to whole words.
 */
function unitsOf(p: TextParagraph, phrases: readonly DecorPhrase[] = []): ScriptUnit[] {
  const whole = [{ key: `${p.id}:u0`, s: 0, e: p.text.length }];
  const quotes = [...phrases].filter((q) => q.start >= 0 && q.end > q.start && q.end <= p.text.length).sort((a, b) => a.start - b.start);
  if (!quotes.length) return whole;
  const out: ScriptUnit[] = [];
  let at = 0;
  const push = (s: number, e: number, extra: Partial<ScriptUnit> = {}): void => {
    if (e > s) out.push({ key: `${p.id}:u${out.length}`, s, e, ...extra });
  };
  for (const q of quotes) {
    const s = snapToWordBoundary(p.text, q.start);
    const e = snapToWordBoundary(p.text, q.end);
    if (s < at || e <= s) continue;
    push(at, s);
    push(s, e, { q: true, spk: q.speaker, conf: q.confirmed, col: q.colour });
    at = e;
  }
  push(at, p.text.length);
  return out.length ? out : whole;
}

const toScriptParagraph = (p: TextParagraph, decor?: ScriptDecor): ScriptParagraph => {
  const notes = decor?.notes.filter((n) => n.paragraphId === p.id);
  return { id: p.id, text: p.text, units: unitsOf(p, decor?.phrases.get(p.id)), ...(notes?.length ? { notes } : {}) };
};

/** The port's words, grouped by the paragraph they were heard in: a word said and not in the script goes with the script word before it. */
function groupByParagraph(words: readonly PortWord[], first: string | undefined): Map<string, PortWord[]> {
  const out = new Map<string, PortWord[]>();
  let current = first;
  for (const w of words) {
    if (w.paragraphId !== undefined) current = w.paragraphId;
    if (current === undefined) continue;
    out.set(current, [...(out.get(current) ?? []), w]);
  }
  return out;
}

/** The model's `Aligner` over what the port heard; a word the recogniser did not score counts as sure. */
function alignerFor(heard: NonNullable<Extract<HeardAnswer, { heard: unknown }>['heard']>, paragraphs: readonly TextParagraph[]): Aligner {
  const byPara = groupByParagraph(heard.words, paragraphs[0]?.id);
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
  extras: Partial<Pick<ChapterInput, 'cuts' | 'effects' | 'accepted'>> & { decor?: ScriptDecor } = {},
): ChapterDoc {
  const { decor, ...rest } = extras;
  const aligner = answer.heard ? alignerFor(answer.heard, paragraphs) : NOT_HEARD;
  return buildDoc({
    paragraphs: paragraphs.map((p) => toScriptParagraph(p, decor)),
    aligner,
    cuts: [],
    effects: [],
    accepted: [],
    decorations: decor?.decorations,
    ...rest,
  });
}
