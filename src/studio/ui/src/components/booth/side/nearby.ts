import type { GuideEntity } from '../../../api/contracts/storyBible';
import { speakerColour, type EntityColour } from '../../../kinds/entityColour';
import type { GuideType } from '../../../types';
import type { BoothUnit } from '../reading/boothUnits';

/** How many phrases from the current one the coming-up words are looked for in. */
const COMING = 12;

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The Story Bible entry a speaker label names, by its canonical name or an alias. */
function entityOfSpeaker(entities: readonly GuideEntity[], speaker: string): GuideEntity | undefined {
  return entities.find((entity) => same(entity.canonical_name, speaker) || entity.aliases.some((alias) => same(alias.text, speaker)));
}

/** How the entry talks: its personality notes, in order. */
export function voiceNote(entity: GuideEntity): string {
  return entity.personality_notes
    .map((note) => note.text.trim())
    .filter(Boolean)
    .join(' ');
}

export type ChapterVoice = { id: string; name: string; voice: string; aliases: string[]; colour?: EntityColour };

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where a name first stands in a text as a whole word, or -1. */
function firstMention(text: string, name: string): number {
  if (name.trim() === '') return -1;
  return text.search(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, 'iu'));
}

/**
 * Who is in the chapter: every character of the Story Bible the chapter names or gives a line to, in the order they first appear, with the labels
 * the chapter speaks them under (the name when it only names them). It is the chapter's cast, not who speaks near the reading position.
 */
export function voicesInChapter(
  paragraphs: ReadonlyArray<{ text: string }>,
  units: readonly BoothUnit[],
  entities: readonly GuideEntity[],
  types: readonly GuideType[] = [],
): ChapterVoice[] {
  const text = paragraphs.map((paragraph) => paragraph.text).join('\n');
  const labels = new Map<string, string[]>();
  for (const unit of units) {
    const entity = unit.quoted && unit.speaker.trim() !== '' ? entityOfSpeaker(entities, unit.speaker) : undefined;
    if (!entity) continue;
    const own = labels.get(entity.id) ?? [];
    if (!own.includes(unit.speaker)) own.push(unit.speaker);
    labels.set(entity.id, own);
  }
  const found: Array<{ at: number; voice: ChapterVoice }> = [];
  for (const entity of entities) {
    if (entity.category.toLowerCase() !== 'character') continue;
    const mentions = [entity.canonical_name, ...entity.aliases.map((alias) => alias.text)].map((name) => firstMention(text, name)).filter((at) => at >= 0);
    const spoken = labels.get(entity.id);
    if (mentions.length === 0 && !spoken) continue;
    found.push({
      at: mentions.length > 0 ? Math.min(...mentions) : Number.MAX_SAFE_INTEGER,
      voice: {
        id: entity.id,
        name: entity.canonical_name,
        voice: voiceNote(entity),
        aliases: spoken ?? [entity.canonical_name],
        colour: speakerColour(types, { category: entity.category, speakerColor: entity.speaker_color }) ?? undefined,
      },
    });
  }
  return found.sort((a, b) => a.at - b.at).map((row) => row.voice);
}

export type ComingUpWord = { word: string; say: string; set: boolean };

/** Names of the Story Bible in the next phrases, with how each is said (its IPA) and whether it has one. */
export function comingUpWords(units: readonly BoothUnit[], cur: number, entities: readonly GuideEntity[]): ComingUpWord[] {
  const text = units
    .slice(cur, cur + COMING)
    .map((unit) => unit.text)
    .join(' ');
  const out = new Map<string, ComingUpWord>();
  for (const entity of entities) {
    for (const alias of [
      { text: entity.canonical_name, ipa: entity.pronunciation.ipa },
      ...entity.aliases.map((a) => ({ text: a.text, ipa: a.pronunciation.ipa })),
    ]) {
      if (alias.text.trim() === '' || out.has(alias.text.toLowerCase())) continue;
      if (!new RegExp(`(?<![\\p{L}\\p{N}_])${alias.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'iu').test(text)) continue;
      out.set(alias.text.toLowerCase(), { word: alias.text, say: alias.ipa, set: alias.ipa.trim() !== '' });
    }
  }
  return [...out.values()];
}
