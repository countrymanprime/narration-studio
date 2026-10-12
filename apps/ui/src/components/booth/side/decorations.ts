import type { Mark, MarkColour, Marks, MarkThreadAuthor } from '../../../api/contracts/marks';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { ParagraphNote, ReadingParagraph, WordDecoration } from '../reading/boothUnits';
import type { BoothReference } from './sections';

// The `decorations` and `notes` props of the Booth text (SN-O62), built from the real data: the Story Bible's names, the Script's
// marks and the notes under a paragraph. Pure; the Booth page passes the result to `BoothText`, and what a click on a marked word or a
// note shows in the side panel.

/** The colour token a Story Bible category is tinted with (the mock's `typeColour`). */
export function entityColour(category: string): string {
  const key = category.trim().toLowerCase();
  if (key === 'character') return '--character';
  if (key === 'place' || key === 'location') return '--place';
  return '--accent';
}

/** The token each of the six mark colours is drawn with, as the Script draws them. */
const MARK_COLOUR: Record<MarkColour, string> = { copper: '--accent', info: '--info', ok: '--ok', warn: '--warn', bad: '--danger', violet: '--org' };
const AUTHOR: Record<MarkThreadAuthor, string | undefined> = { you: undefined, author: 'Author', proofer: 'Proofer' };

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

/** The marks on these paragraphs that still stand on the text (a stale mark has lost its place). */
const standing = (paragraphs: readonly ReadingParagraph[], marks: Marks): Mark[] => {
  const ids = new Set(paragraphs.map((paragraph) => paragraph.id));
  return marks.marks.filter((mark) => !mark.stale && ids.has(mark.paragraphId));
};

/** The marked words, underlined in their type's colour and named by it. */
function markDecorations(own: readonly Mark[], marks: Marks): WordDecoration[] {
  return own
    .filter((mark) => mark.end > mark.start)
    .map((mark) => {
      const type = marks.types.find((item) => item.key === mark.type);
      return {
        paragraphId: mark.paragraphId,
        start: mark.start,
        end: mark.end,
        kind: 'mark' as const,
        colour: MARK_COLOUR[type?.colour ?? 'copper'],
        title: type?.name ?? mark.type,
      };
    });
}

/** The notes drawn under a paragraph: a mark that carries text, and is not a question to the author (as the mock's `paragraphNotes`). */
function paragraphNotes(own: readonly Mark[], marks: Marks): ParagraphNote[] {
  return own
    .filter((mark) => mark.text.trim() !== '' && !marks.types.find((type) => type.key === mark.type)?.asks)
    .map((mark) => ({
      id: mark.id,
      paragraphId: mark.paragraphId,
      name: marks.types.find((type) => type.key === mark.type)?.name ?? mark.type,
      text: mark.text,
    }));
}

/** The mark on the clicked word, if any: the first standing mark whose range touches the word. */
export function markAtWord(paragraphs: readonly ReadingParagraph[], marks: Marks, paragraphId: string, word: number): Mark | undefined {
  const text = paragraphs.find((paragraph) => paragraph.id === paragraphId)?.text ?? '';
  const match = [...text.matchAll(/\S+/g)][word];
  if (!match) return undefined;
  const from = match.index;
  const to = from + match[0].length;
  return standing(paragraphs, marks).find((mark) => mark.paragraphId === paragraphId && mark.end > mark.start && mark.start < to && mark.end > from);
}

/** What the side panel shows for a mark: its type's name, the words it marks, and its thread with the mark's own text first. */
export function markNote(mark: Mark, marks: Marks): NonNullable<BoothReference['note']> {
  const name = marks.types.find((type) => type.key === mark.type)?.name ?? mark.type;
  const messages = [...(mark.text ? [{ text: mark.text }] : []), ...mark.thread.map((message) => ({ who: AUTHOR[message.who], text: message.text }))];
  return { name, quote: mark.quote, messages };
}

export type BoothDecorations = { decorations: WordDecoration[]; notes: ParagraphNote[] };

export function boothDecorations(paragraphs: readonly ReadingParagraph[], entities: readonly GuideEntity[], marks: Marks): BoothDecorations {
  const own = standing(paragraphs, marks);
  return { decorations: [...entityDecorations(paragraphs, entities), ...markDecorations(own, marks)], notes: paragraphNotes(own, marks) };
}
