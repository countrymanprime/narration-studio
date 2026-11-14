import { plural } from '../../plural';

/**
 * What one holder says about itself: a specific singular `label` ("your edit of the note on “Alice”"), a nameless `brief` for when the label does not fit
 * ("your note edit"), and `many` for how a run of the same `kind` reads ("3 replies you are writing"). Holders of one `kind` merge into one phrase;
 * without a `kind`, identical labels do.
 */
export type DraftLabel = {
  label: string;
  brief?: string;
  kind?: string;
  many?: (count: number) => string;
  /** For a draft that cannot be saved from where it is: what has to happen first, in words the narrator uses ("an entry chosen under To"). The question says it beside the missing Save. */
  needs?: string;
};

/**
 * Settings' own edited fields, named in the question only when a draft that cannot be saved is held beside them (#3446 D4): then the question is Discard-only and has
 * to say everything it would drop. With only Settings' fields (or fields beside saveable drafts) the question keeps Settings' older sentence.
 */
export const SETTINGS_HELD: HeldDraft = { label: 'your settings edits', brief: 'settings edits', saveable: true };

/** A held draft, and whether the question can save it (a new Story Bible entry has no category yet, so it can only be kept or discarded). */
export type HeldDraft = DraftLabel & { saveable: boolean };

/**
 * The most characters the words naming what is held may take, so the whole question stays inside the dialog at 320 x 300 (it measures two lines of
 * body beside the buttons). Past it the phrase falls back to the nameless briefs, then to a count.
 */
const ROOM = 38;
const MAX_ITEMS = 3;
const MAX_NAME = 20;
/** The longest name the explanation of a missing Save quotes; a longer one is said with its brief. */
const STUCK_NAME = 30;

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
 * Every draft saveable: "Save or discard …". Any that cannot be saved: "Discard …", with a way to keep editing, and no Save (#3400 D1: only a Discard drops text).
 */
export function draftQuestion(held: readonly HeldDraft[], leaving: boolean): { body: string; canSave: boolean } {
  // What was held went away while the question was open (an editor closed itself): there is nothing to name, and nothing to lose by going on.
  if (held.length === 0) return { body: 'There is nothing left to save or discard.', canSave: true };
  const end = leaving ? 'leaving' : 'going on';
  // Save & continue saves all or nothing: saving an editor can close it, and with it a draft beside it that cannot be saved (an entry's Save leaves edit mode and
  // takes a half-filled relationship row along). So one draft that cannot be saved takes Save away; the narrator keeps editing, or discards.
  const stuck = held.filter((draft) => !draft.saveable);
  if (stuck.length > 0) {
    // Save is gone, and the narrator is told why in one short sentence that names the thing, and what brings Save back (#3457, ux-reviewer).
    const first = stuck.find((draft) => draft.needs) ?? stuck[0]!;
    const name = length(first.label) <= STUCK_NAME ? first.label : (first.brief ?? first.label);
    const why = first.needs ? `Save is off: ${capital(name)} still needs ${first.needs}.` : `Save is off: ${capital(name)} cannot be saved from here.`;
    // One held thing is named once, in the first sentence: the second says "it" (#3457, qa-breaker round 2).
    return { body: `${why} Discard ${held.length === 1 ? (/^\d/.test(first.label) ? 'them' : 'it') : describeHeld(held)} before ${end}?`, canSave: false };
  }
  return { body: `Save or discard ${describeHeld(held)} before ${end}?`, canSave: true };
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * What Save & continue does once the saves are done (#3400 D1). It goes on only when everything that could be saved was, and nothing else is held: a draft
 * that said it did not save, one with no save of its own, or one that became held while the saves ran keeps the narrator where they are, with its text, and
 * the message names it. Only Discard & continue drops text. `undefined` is a Settings save that did not finish, which stays without a message of its own.
 */
export function saveVerdict(
  outcome: { saved: boolean; failed?: readonly DraftLabel[]; kept: readonly DraftLabel[]; late?: readonly DraftLabel[] } | undefined,
): { proceed: boolean; message?: string } {
  if (!outcome) return { proceed: false };
  const { failed = [], kept, late = [] } = outcome;
  // Nothing is saved while a draft that cannot be saved is held (the registry skips the saves), so the message says so.
  if (kept.length > 0 && failed.length === 0 && late.length === 0)
    return { proceed: false, message: `${capital(describeHeld(kept))} cannot be saved yet, so nothing was saved and you are still here.` };
  if (outcome.saved && kept.length === 0 && late.length === 0) return { proceed: true };
  const parts = [
    failed.length > 0 ? `${describeHeld(failed)} did not save` : '',
    kept.length > 0 ? `${describeHeld(kept)} cannot be saved yet` : '',
    late.length > 0 ? `${describeHeld(late)} changed while saving` : '',
  ].filter(Boolean);
  return { proceed: false, message: parts.length > 0 ? `${capital(parts.join('; '))}, so you are still here.` : undefined };
}

/** The same for Discard & continue: a draft that could not be dropped keeps the narrator where they are, and the message says what went and what is still here. */
export function discardVerdict(outcome: { failed: readonly DraftLabel[] }): { proceed: boolean; message?: string } {
  if (outcome.failed.length === 0) return { proceed: true };
  return { proceed: false, message: `${capital(describeHeld(outcome.failed))} could not be discarded and is still here. The rest was discarded.` };
}
