import { wordCount, type BoothUnit, type ReadingParagraph } from './boothUnits';

/** Where the narrator is in the chapter's sentences: the sentence and the word in it. */
export type UnitPosition = { cur: number; wcur: number };

/** Where the narrator is in the paragraphs: a paragraph and the word number in it. Stable when the sentences are cut again. */
export type ReadingPosition = { paragraphId: string; word: number };

const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(high, n));

/** The paragraph and word where a sentence position is, or null when there is no such sentence. */
export function positionOf(paragraphs: readonly ReadingParagraph[], units: readonly BoothUnit[], at: UnitPosition): ReadingPosition | null {
  const unit = units[at.cur];
  const paragraph = unit && paragraphs[unit.paragraphIndex];
  if (!unit || !paragraph) return null;
  return { paragraphId: paragraph.id, word: wordCount(paragraph.text.slice(0, unit.start)) + clamp(at.wcur, 0, unit.words - 1) };
}

/** The sentence and word for a paragraph and word number, or null when the paragraph is not in the chapter. */
export function unitAtPosition(paragraphs: readonly ReadingParagraph[], units: readonly BoothUnit[], position: ReadingPosition): UnitPosition | null {
  const own = units.flatMap((unit, index) => (unit.paragraphId === position.paragraphId ? [{ unit, index }] : []));
  if (!own.length) return null;
  const text = paragraphs.find((p) => p.id === position.paragraphId)?.text ?? '';
  const before = (unit: BoothUnit) => wordCount(text.slice(0, unit.start));
  const hit = own.filter((x) => before(x.unit) <= position.word).at(-1) ?? own[0];
  return { cur: hit.index, wcur: clamp(position.word - before(hit.unit), 0, hit.unit.words - 1) };
}

/** One word on (1) or back (-1). Past the end of a sentence it starts the next one, and back again; it stops at the chapter's ends. */
export function stepWord(units: readonly BoothUnit[], at: UnitPosition, direction: 1 | -1): UnitPosition {
  if (!units.length) return at;
  const cur = clamp(at.cur, 0, units.length - 1);
  const wcur = at.wcur + direction;
  if (direction > 0 && wcur >= units[cur].words) return cur >= units.length - 1 ? { cur, wcur: at.wcur } : { cur: cur + 1, wcur: 0 };
  if (direction < 0 && wcur < 0) return cur <= 0 ? { cur, wcur: at.wcur } : { cur: cur - 1, wcur: units[cur - 1].words - 1 };
  return { cur, wcur };
}

export function nextPhrase(units: readonly BoothUnit[], at: UnitPosition): UnitPosition {
  return { cur: Math.min(units.length - 1, at.cur + 1), wcur: 0 };
}

export function backPhrase(at: UnitPosition): UnitPosition {
  return { cur: Math.max(0, at.cur - 1), wcur: 0 };
}
