import type { HeardAnswer, HeardWord as PortWord } from '../../../ports/alignment';
import { buildDoc, type Aligner, type ChapterDoc, type ChapterInput, type Heard, type HeardWord, type ScriptParagraph } from '../model';

/** A paragraph of the chapter as the workspace port gives it. */
export interface TextParagraph {
  id: string;
  text: string;
}

/** Seconds of lead-in before a stretch's first word, so the model's offsets begin just after zero. */
const LEAD = 0.15;

/** A paragraph is one phrase: the port knows no phrases, so the cursor steps by paragraph where the mock steps by phrase. */
const toScriptParagraph = (p: TextParagraph): ScriptParagraph => ({ id: p.id, text: p.text, units: [{ key: `${p.id}:u0`, s: 0, e: p.text.length }] });

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
  extras: Partial<Pick<ChapterInput, 'cuts' | 'effects' | 'accepted'>> = {},
): ChapterDoc {
  const aligner = answer.heard ? alignerFor(answer.heard, paragraphs) : NOT_HEARD;
  return buildDoc({ paragraphs: paragraphs.map(toScriptParagraph), aligner, cuts: [], effects: [], accepted: [], ...extras });
}
