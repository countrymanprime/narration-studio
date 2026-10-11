import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { BoothUnit } from '../reading/boothUnits';

/** How many phrases before and after the current one count as "nearby" (the mock's window). */
const BEHIND = 6;
const AHEAD = 9;
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

export type NearbyVoice = { id: string; name: string; voice: string; aliases: string[] };

/** The speakers in and around the current phrase, one row per Story Bible entry with the labels used for it. */
export function voicesNearby(units: readonly BoothUnit[], cur: number, entities: readonly GuideEntity[]): NearbyVoice[] {
  const byEntry = new Map<string, NearbyVoice>();
  for (const unit of units.slice(Math.max(0, cur - BEHIND), cur + AHEAD)) {
    const entity = unit.quoted && unit.speaker.trim() !== '' ? entityOfSpeaker(entities, unit.speaker) : undefined;
    if (!entity) continue;
    const row = byEntry.get(entity.id) ?? { id: entity.id, name: entity.canonical_name, voice: voiceNote(entity), aliases: [] };
    if (!row.aliases.includes(unit.speaker)) row.aliases.push(unit.speaker);
    byEntry.set(entity.id, row);
  }
  return [...byEntry.values()];
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
