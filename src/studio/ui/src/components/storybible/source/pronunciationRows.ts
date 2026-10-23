import type { GuideEntity, GuidePronunciation } from '../../../types';

/** One name of an entry and the pronunciation it carries. `aliasIndex` is absent for the entry's own name. */
export type NameRow = { name: string; aliasIndex?: number; pronunciation: GuidePronunciation };

/**
 * The names of an entry in the order they are shown: its first name, then each alias. The first name and the entry's own
 * pronunciation are one value (the mock's rule), so the entry's own pronunciation is the first name's and is shown once.
 */
export function nameRows(entity: GuideEntity): NameRow[] {
  return [
    { name: entity.canonical_name, pronunciation: entity.pronunciation },
    ...entity.aliases.map((alias, aliasIndex) => ({ name: alias.text, aliasIndex, pronunciation: alias.pronunciation })),
  ];
}
