import type { PassagePlace } from '../../../api/contracts/passageMap';
import { wordCount, type BoothUnit, type ReadingParagraph } from '../reading/boothUnits';
import type { UnitPosition } from '../reading/readingPosition';

const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(high, n));

/**
 * The place in the text a reading position stands at: the paragraph id and the word number in it (the mock's `placeOf`).
 * The sentence is clamped to the chapter and the word to the paragraph's end, a place the host accepts. The chapter heading is not a
 * manuscript paragraph, so a place in it is the start of the first paragraph. Null when the chapter has no sentences.
 */
export function placeOf(paragraphs: readonly ReadingParagraph[], units: readonly BoothUnit[], at: UnitPosition): PassagePlace | null {
  if (units.length === 0) return null;
  const unit = units[clamp(at.cur, 0, units.length - 1)];
  if (paragraphs[unit.paragraphIndex]?.heading) {
    const first = units.find((item) => !paragraphs[item.paragraphIndex]?.heading);
    return first ? { pid: first.paragraphId, word: 0 } : null;
  }
  const text = paragraphs[unit.paragraphIndex]?.text ?? '';
  return {
    pid: unit.paragraphId,
    word: Math.min(wordCount(text), wordCount(text.slice(0, unit.start)) + Math.max(0, at.wcur)),
  };
}
