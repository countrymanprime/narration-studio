import { plural } from '../../plural';

/** What one holder says about itself: a specific singular `label` ("your edit of the note on “Alice”"), and `many` for how a run of identical ones reads ("3 replies you are writing"). */
export type DraftLabel = { label: string; many?: (count: number) => string };

/** The longest list the question names; past it, or past `MAX_ITEMS` kinds, it says how many instead, so the whole sentence fits the dialog at 320 x 300. */
const MAX_LIST = 48;
const MAX_ITEMS = 3;
const MAX_NAME = 28;

/** A name inside a label, shortened with an ellipsis so one long entry name cannot push the end of the sentence out of the dialog. */
export function shortName(name: string): string {
  const text = name.trim();
  return [...text].length > MAX_NAME
    ? `${[...text]
        .slice(0, MAX_NAME - 1)
        .join('')
        .trimEnd()}…`
    : text;
}

const joinList = (items: string[]): string => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** "your changes to Alice", "3 replies you are writing and your edit of a note", or, when that is too long, "5 unsaved changes". */
export function describeHeld(held: readonly DraftLabel[]): string {
  const counts = new Map<string, { count: number; many?: (count: number) => string }>();
  for (const { label, many } of held) {
    const seen = counts.get(label);
    if (seen) seen.count += 1;
    else counts.set(label, { count: 1, many });
  }
  const items = [...counts.entries()].map(([label, { count, many }]) => (count > 1 && many ? many(count) : label));
  const list = joinList(items);
  if (items.length <= MAX_ITEMS && [...list].length <= MAX_LIST) return list;
  return held.length === 1 ? 'your unsaved changes' : plural(held.length, 'unsaved change');
}
