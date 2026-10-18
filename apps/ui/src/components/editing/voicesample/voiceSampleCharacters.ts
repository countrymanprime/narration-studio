import type { GuideDialogueCue, GuideEntity } from '../../../api/contracts/storyBible';

/** The reserved character id for plain narration, as in apps/desktop/internal/voicesample. */
const NARRATION_ID = 'narration';

export type CharacterChoice = { id: string; name: string; group?: 'In this chapter' | 'All characters' };

const byName = (a: GuideEntity, b: GuideEntity): number => a.canonical_name.localeCompare(b.canonical_name);

const isCharacter = (entity: GuideEntity): boolean => entity.category.toLowerCase() === 'character';

/**
 * Who a sample can be for, in the order the dialog lists them: the characters who speak in this chapter (by the Story Bible's dialogue cues),
 * then every other character, then Narration. A cue with no speaker, or one whose speaker the Story Bible no longer has, adds nobody.
 */
export function characterChoices(entities: readonly GuideEntity[], cues: readonly GuideDialogueCue[], chapterId: string): CharacterChoice[] {
  const characters = entities.filter(isCharacter).sort(byName);
  const speaking = new Set(cues.filter((c) => c.chapterId === chapterId && c.speaker_entity_id).map((c) => c.speaker_entity_id));
  const inChapter = characters.filter((c) => speaking.has(c.id));
  const others = characters.filter((c) => !speaking.has(c.id));
  return [
    ...inChapter.map((c) => ({ id: c.id, name: c.canonical_name, group: 'In this chapter' as const })),
    ...others.map((c) => ({ id: c.id, name: c.canonical_name, group: 'All characters' as const })),
    { id: NARRATION_ID, name: 'Narration' },
  ];
}

/**
 * The character whose quote the word `key` (`paragraphId:ordinal`) is in, or undefined when the word is outside every quote, is a word that was
 * only said, or its speaker is not a character the Story Bible has. The quote's range is in characters of the paragraph's text.
 */
export function speakerOfWord(
  cues: readonly GuideDialogueCue[],
  paragraphs: readonly { id: string; text: string }[],
  chapterId: string,
  key: string,
  entities: readonly GuideEntity[],
): string | undefined {
  const at = key.lastIndexOf(':');
  const paragraph = paragraphs.find((p) => p.id === key.slice(0, at));
  const ordinal = /^\d+$/.test(key.slice(at + 1)) ? Number(key.slice(at + 1)) : -1;
  if (!paragraph || ordinal < 0) return undefined;
  const start = [...paragraph.text.matchAll(/\S+/g)][ordinal]?.index;
  if (start === undefined) return undefined;
  const found = cues.find((c) => c.chapterId === chapterId && c.paragraphId === paragraph.id && c.quote_start <= start && start < c.quote_end);
  const speaker = found?.speaker_entity_id;
  return speaker && entities.some((e) => e.id === speaker && isCharacter(e)) ? speaker : undefined;
}
