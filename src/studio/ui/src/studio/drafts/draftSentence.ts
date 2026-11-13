import { plural } from '../../plural';

/**
 * What one holder says about itself: a specific singular `label` ("your edit of the note on “Alice”"), a nameless `brief` for when the label does not fit
 * ("your note edit"), and `many` for how a run of the same `kind` reads ("3 replies you are writing"). Holders of one `kind` merge into one phrase;
 * without a `kind`, identical labels do.
 */
export type DraftLabel = { label: string; brief?: string; kind?: string; many?: (count: number) => string };

/** A held draft, and whether the question can save it (a new Story Bible entry has no category yet, so it can only be kept or discarded). */
export type HeldDraft = DraftLabel & { saveable: boolean };

/**
 * The most characters the words naming what is held may take, so the whole question stays inside the dialog at 320 x 300 (it measures two lines of
 * body beside the buttons). Past it the phrase falls back to the nameless briefs, then to a count.
 */
const ROOM = 34;
/** The room each of the two phrases gets when the question names what it saves and what it cannot save. */
const ROOM_EACH = 17;
const MAX_ITEMS = 3;
const MAX_NAME = 20;

const graphemes = (text: string): string[] =>
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((part) => part.segment)
    : [...text];

/** A name inside a label, shortened with an ellipsis so one long entry name cannot push the end of the sentence out of the dialog. Cuts between characters as read, never inside one. */
export function shortName(name: string, max = MAX_NAME): string {
  const text = name.trim();
  const letters = graphemes(text);
  return letters.length > max
    ? `${letters
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : text;
}

const joinList = (items: string[]): string => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const length = (text: string): number => graphemes(text).length;

/** "your changes to Alice", "3 replies you are writing and your edit of a note", or, when that is too long, the briefs, then "5 unsaved changes". */
export function describeHeld(held: readonly DraftLabel[], room = ROOM): string {
  const groups = new Map<string, { count: number; first: DraftLabel }>();
  for (const draft of held) {
    const key = draft.kind ?? draft.label;
    const seen = groups.get(key);
    if (seen) seen.count += 1;
    else groups.set(key, { count: 1, first: draft });
  }
  const phrase = (pick: (draft: DraftLabel) => string) =>
    [...groups.values()].map(({ count, first }) => (count > 1 && first.many ? first.many(count) : count > 1 ? `${pick(first)} (${count})` : pick(first)));
  for (const pick of [(draft: DraftLabel) => draft.label, (draft: DraftLabel) => draft.brief ?? draft.label]) {
    const items = phrase(pick);
    const list = joinList(items);
    if (items.length <= MAX_ITEMS && length(list) <= room) return list;
  }
  const count = plural(held.length, 'unsaved change');
  return held.length > 1 && length(count) <= room ? count : 'your changes';
}

/**
 * The question put when the narrator is about to leave, or go on to something that replaces the editor: its sentence and whether Save is offered.
 * Every draft saveable: "Save or discard …". None: "Discard …", with a way to keep editing. Some: Save & continue saves those and then stays, because the
 * rest cannot be saved and only a Discard drops text; the sentence names them (#3400).
 */
export function draftQuestion(held: readonly HeldDraft[], leaving: boolean): { body: string; canSave: boolean } {
  const end = leaving ? 'leaving' : 'going on';
  const saveable = held.filter((draft) => draft.saveable);
  const loose = held.filter((draft) => !draft.saveable);
  if (saveable.length === 0) return { body: `Discard ${describeHeld(loose)} before ${end}?`, canSave: false };
  if (loose.length === 0) return { body: `Save or discard ${describeHeld(saveable)} before ${end}?`, canSave: true };
  return { body: `Save or discard ${describeHeld(saveable, ROOM_EACH)}? Not saved yet: ${describeHeld(loose, ROOM_EACH)}.`, canSave: true };
}
