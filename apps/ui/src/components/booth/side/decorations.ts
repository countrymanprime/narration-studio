import type { PrepMarkupSpan } from '../../../api/contracts/prepMarkup';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { ParagraphNote, ReadingParagraph, WordDecoration } from '../reading/boothUnits';

// The `decorations` and `notes` props of the Booth text (SN-O62), built from the real data: the Story Bible's names, the prep markup
// marks and the notes under a paragraph. Pure; the Booth page passes the result to `BoothText`.

/** The colour token a Story Bible category is tinted with (the mock's `typeColour`). */
export function entityColour(category: string): string {
  const key = category.trim().toLowerCase();
  if (key === 'character') return '--character';
  if (key === 'place' || key === 'location') return '--place';
  return '--accent';
}

const MARK_COLOUR: Record<PrepMarkupSpan['kind'], string> = { stress: '--accent', pause: '--text-muted', character_tag: '--character' };
const MARK_NAME: Record<PrepMarkupSpan['kind'], string> = { stress: 'Stress', pause: 'Pause', character_tag: 'Character tag' };

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every place a name of a Story Bible entry (its own or an alias) stands in a paragraph, as an entity tint. */
function entityDecorations(paragraphs: readonly ReadingParagraph[], entities: readonly GuideEntity[]): WordDecoration[] {
  const out: WordDecoration[] = [];
  for (const entity of entities) {
    const colour = entityColour(entity.category);
    const names = new Set([entity.canonical_name, ...entity.aliases.map((alias) => alias.text)].filter((name) => name.trim() !== ''));
    for (const name of names) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, 'gu');
      for (const paragraph of paragraphs) {
        for (const hit of paragraph.text.matchAll(pattern)) {
          out.push({ paragraphId: paragraph.id, start: hit.index, end: hit.index + name.length, kind: 'entity', colour, title: entity.canonical_name });
        }
      }
    }
  }
  return out;
}

/** The prep markup marks that still stand on the text (a stale mark has lost its place), as marked-word underlines. */
function markDecorations(spans: readonly PrepMarkupSpan[]): WordDecoration[] {
  return spans
    .filter((span) => !span.stale && span.end > span.start)
    .map((span) => ({
      paragraphId: span.paragraphId,
      start: span.start,
      end: span.end,
      kind: 'mark' as const,
      colour: MARK_COLOUR[span.kind],
      title: MARK_NAME[span.kind],
    }));
}

/** The notes drawn under a paragraph: a mark that carries a value. */
function paragraphNotes(spans: readonly PrepMarkupSpan[]): ParagraphNote[] {
  return spans
    .filter((span) => !span.stale && span.value.trim() !== '')
    .map((span) => ({ id: span.id, paragraphId: span.paragraphId, name: MARK_NAME[span.kind], text: span.value }));
}

export type BoothDecorations = { decorations: WordDecoration[]; notes: ParagraphNote[] };

export function boothDecorations(
  paragraphs: readonly ReadingParagraph[],
  entities: readonly GuideEntity[],
  spans: readonly PrepMarkupSpan[],
): BoothDecorations {
  return { decorations: [...entityDecorations(paragraphs, entities), ...markDecorations(spans)], notes: paragraphNotes(spans) };
}
