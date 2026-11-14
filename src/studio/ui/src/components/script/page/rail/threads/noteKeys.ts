import { useRef } from 'react';
import type { Mark } from '../../../../../api/contracts/marks';

type Known = { ids: Map<string, string>; aliases: Map<string, Set<string>>; says: Map<string, string>; next: number };

/**
 * The identity of each note card, kept across everything the page does to the marks under it (#3400, qa-breaker on #3458): a note is told apart by a key it is given the
 * first time it is drawn and keeps while it lives, never by where it stands in the list. Deleting or reordering a note on the same passage moves no key; a note the host replaces
 * (changing its Type, clearing its opening message gives the mark a new id) takes over the key of the one that went from the same passage in the same list, so the reply, the
 * "who wrote this" choice and the open edit follow it. `idsOf` answers every id a card has had, so an edit pointing at the old id still finds its card.
 */
export function useNoteKeys(marks: readonly Mark[]): { keyOf: (mark: Mark) => string; idsOf: (mark: Mark) => ReadonlySet<string> } {
  const known = useRef<Known>({ ids: new Map(), aliases: new Map(), says: new Map(), next: 0 });
  const state = known.current;
  const passageOf = (mark: Mark) => `${mark.chapterId}:${mark.paragraphId}:${mark.start}-${mark.end}`;
  // What a note says, apart from its id and type: when several notes of one passage are replaced in one list, each takes over the key of the one that said the same.
  const saysOf = (mark: Mark) => [mark.createdAt, mark.text, ...mark.thread.map((message) => `${message.at}|${message.who}|${message.text}`)].join('\n');
  const present = new Set(marks.map((mark) => mark.id));
  // The keys that went since the last list, by passage, in the order they were first seen: a mark that arrives on one of those passages is their replacement.
  const gone = new Map<string, { key: string; says: string }[]>();
  for (const [id, key] of state.ids) {
    if (present.has(id)) continue;
    const passage = key.slice(0, key.lastIndexOf('#'));
    gone.set(passage, [...(gone.get(passage) ?? []), { key, says: state.says.get(id) ?? '' }]);
    state.ids.delete(id);
    state.says.delete(id);
  }
  for (const mark of marks) {
    if (state.ids.has(mark.id)) continue;
    const passage = passageOf(mark);
    const left = gone.get(passage) ?? [];
    const same = left.findIndex((row) => row.says === saysOf(mark));
    const key = left.splice(same >= 0 ? same : 0, 1)[0]?.key ?? `${passage}#${state.next++}`;
    state.ids.set(mark.id, key);
    state.aliases.set(key, new Set([...(state.aliases.get(key) ?? []), mark.id]));
  }
  // What each note says as of now, for the next list's replacements.
  for (const mark of marks) state.says.set(mark.id, saysOf(mark));
  // Keys nobody holds any more are forgotten with their ids.
  const live = new Set(state.ids.values());
  for (const key of [...state.aliases.keys()]) if (!live.has(key)) state.aliases.delete(key);
  return { keyOf: (mark) => state.ids.get(mark.id)!, idsOf: (mark) => state.aliases.get(state.ids.get(mark.id)!) ?? new Set([mark.id]) };
}
