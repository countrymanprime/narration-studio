// The Script page's pure selectors, ported from the Studio Next mock's `selectors/annotations.ts`, `bible.ts`, `phrases.ts`
// and `speakers.ts` onto the host's lists: marks and their types (`marksList`), Story
// Bible entries (`guideEntities`, which hold every name's pronunciation, #2595) and dialogue cues (`guideDialogueCues`). Each takes plain lists and returns a new value; none
// mutates its input or reads anything else, so the hooks bind them and a story or test calls them with no host.

import type { GuideDialogueCue, GuideEntity, GuidePronunciation, GuideType } from '../../../../api/contracts/storyBible';
import type { ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import type { Mark, MarkThreadAuthor, MarkType } from '../../../../api/contracts/marks';
import { cueSpeakerState, type CueSpeakerState } from '../../../manuscript/dialogueCues.selectors';

/** A flagged word's key as the host stores it: the text trimmed and lower-cased. */
export const wordKey = (text: string): string => text.trim().toLowerCase();

const typeOf = (types: readonly MarkType[], mark: Mark): MarkType | undefined => types.find((type) => type.key === mark.type);

/** A mark whose type asks: a query that tracks a reply. */
export const isAsk = (types: readonly MarkType[], mark: Mark): boolean => typeOf(types, mark)?.asks ?? false;

export const marksInChapter = (marks: readonly Mark[], chapterId: string): Mark[] => marks.filter((mark) => mark.chapterId === chapterId);

/** One message of a mark's thread. The mark's own text is the narrator's opening message, at index -1. */
export type MarkMessage = { who: MarkThreadAuthor; text: string; at: string; index: number };

/** A note and a query are the same thing: a thread on a passage. The opening message is left out when the mark has no text. */
export function markMessages(mark: Mark): MarkMessage[] {
  const opening: MarkMessage[] = mark.text ? [{ who: 'you', text: mark.text, at: '', index: -1 }] : [];
  return [...opening, ...mark.thread.map((message, index) => ({ ...message, index }))];
}

/** Whether a name has a pronunciation: the mock's Set and Not set. A word with no Story Bible entry has none, and is not listed. */
export type NameStatus = 'set' | 'not_set';

/** One row of the Words tab: one name (an entry's own or one alias) of a Story Bible entry found in the chapter's text. */
export type ChapterWord = {
  /** The name's key: its text trimmed and lower-cased, what the view's selected word holds. */
  key: string;
  /** The name as the entry spells it. */
  name: string;
  entryId: string;
  /** Absent for the entry's own name. */
  aliasIndex?: number;
  /** The entry's category (a Story Bible type), so a plain `Word` can be told from a character or a place. */
  category: string;
  pronunciation: GuidePronunciation;
  status: NameStatus;
};

/** Each name of an entry as a row, its own first. */
function namesWithPronunciation(entry: GuideEntity): Omit<ChapterWord, 'status'>[] {
  const own = {
    key: wordKey(entry.canonical_name),
    name: entry.canonical_name,
    entryId: entry.id,
    category: entry.category,
    pronunciation: entry.pronunciation,
  };
  const aliases = entry.aliases.map((alias, aliasIndex) => ({
    key: wordKey(alias.text),
    name: alias.text,
    entryId: entry.id,
    aliasIndex,
    category: entry.category,
    pronunciation: alias.pronunciation,
  }));
  return [own, ...aliases];
}

const statusOf = (pronunciation: GuidePronunciation): NameStatus => (pronunciation.ipa.trim() ? 'set' : 'not_set');

/** The name of the Story Bible that has this key: what the Words card shows for the selected word. */
export function nameByKey(entries: readonly GuideEntity[], key: string): ChapterWord | undefined {
  for (const entry of entries) for (const row of namesWithPronunciation(entry)) if (row.key === key) return { ...row, status: statusOf(row.pronunciation) };
  return undefined;
}

/**
 * Every word the narrator will meet in a chapter with how it is said: each Story Bible name found in its text, once, in the order it first
 * appears. The value is the entry's (#2595): there is no second list, so nothing decides between two.
 */
export function chapterWords(entries: readonly GuideEntity[], paragraphs: readonly Pick<ManuscriptParagraph, 'text'>[]): ChapterWord[] {
  const seen = new Set<string>();
  const rows: ChapterWord[] = [];
  for (const paragraph of paragraphs) {
    for (const mention of mentionsIn(entries, paragraph.text)) {
      const key = wordKey(mention.text);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = entries.find((row) => row.id === mention.entryId);
      const name = entry && namesWithPronunciation(entry).find((row) => row.key === key);
      if (name) rows.push({ ...name, status: statusOf(name.pronunciation) });
    }
  }
  return rows;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export type ChapterFactsInput = {
  types: readonly MarkType[];
  marks: readonly Mark[];
  entries: readonly GuideEntity[];
  /** Quoted phrases in the chapter that nothing attributes to a speaker (`unattributed`). */
  unattributed: number;
};

/** The "3 notes · 2 without pronunciation" line on a chapter card, as the mock counts it. */
export function chapterFacts(input: ChapterFactsInput, chapterId: string): string {
  const inChapter = marksInChapter(input.marks, chapterId);
  const notes = inChapter.length;
  // Each place in the chapter a Story Bible name with no pronunciation is found (the entry's own evidence, as the host records it).
  const unsaid = input.entries.reduce(
    (n, entry) =>
      n +
      (statusOf(entry.pronunciation) === 'not_set' ? entry.occurrences.filter((at) => at.chapterId === chapterId).length : 0) +
      entry.aliases
        .filter((alias) => statusOf(alias.pronunciation) === 'not_set')
        .reduce((m, alias) => m + alias.occurrences.filter((at) => at.chapterId === chapterId).length, 0),
    0,
  );
  const speakers = input.unattributed ? ` · ${input.unattributed} without a speaker` : '';
  return `${plural(notes, 'note', 'notes')} · ${unsaid} without pronunciation${speakers}`;
}

/* ---------- Story Bible ---------- */

export const entryById = (entries: readonly GuideEntity[], id: string | null | undefined): GuideEntity | undefined =>
  id ? entries.find((entry) => entry.id === id) : undefined;

/** Every name an entry goes by: its own, then its aliases. */
const namesOf = (entry: GuideEntity): string[] => [entry.canonical_name, ...entry.aliases.map((alias) => alias.text)].filter((name) => name.trim());

/** Entries whose name or another name contains the search, ignoring case, of one category or of all (`'All'`). */
export function findEntries(entries: readonly GuideEntity[], query: string, category: string): GuideEntity[] {
  const q = query.trim().toLowerCase();
  return entries.filter(
    (entry) => (category === 'All' || entry.category === category) && (!q || namesOf(entry).some((name) => name.toLowerCase().includes(q))),
  );
}

/** A name of an entry found in a paragraph's text: UTF-16 offsets into the text. */
export type Mention = { start: number; end: number; text: string; entryId: string };

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The entries' names in a text, left to right, never overlapping: at each place the longest name wins, a name matches as a
 * whole word only (a combining accent is part of the word), and case is ignored. A name two entries share belongs to the first in the list.
 */
export function mentionsIn(entries: readonly GuideEntity[], text: string): Mention[] {
  const owner = new Map<string, string>();
  for (const entry of entries) for (const name of namesOf(entry)) if (!owner.has(name.toLowerCase())) owner.set(name.toLowerCase(), entry.id);
  if (owner.size === 0) return [];
  const names = [...owner.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${names.map(escape).join('|')})(?![\\p{L}\\p{M}\\p{N}_])`, 'giu');
  return [...text.matchAll(re)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
    entryId: owner.get(match[0].toLowerCase()) ?? '',
  }));
}

/** Entries mentioned anywhere in the paragraphs of a chapter, in the Story Bible's order. */
export function entriesInChapter(entries: readonly GuideEntity[], paragraphs: readonly Pick<ManuscriptParagraph, 'text'>[]): GuideEntity[] {
  const found = new Set(paragraphs.flatMap((paragraph) => mentionsIn(entries, paragraph.text).map((mention) => mention.entryId)));
  return entries.filter((entry) => found.has(entry.id));
}

/* ---------- Speakers ---------- */

/** Entries that can be picked as a speaker: those whose Story Bible type can speak, so the type's Can speak flag decides. An
 * entry whose type the list lacks is silent, as `canSpeak` in `storyBibleTypes.ts` reads it. */
export function speakerCandidates(entries: readonly GuideEntity[], types: readonly GuideType[]): GuideEntity[] {
  const speaking = new Set(types.filter((type) => type.speaks).map((type) => type.name));
  return entries.filter((entry) => speaking.has(entry.category));
}

/** A quoted phrase of a paragraph, from the Story Bible's dialogue cues; `state` is the chip's (`cueSpeakerState`). */
export type Phrase = { cueId: string; start: number; end: number; text: string; speaker: GuideEntity | null; state: CueSpeakerState };

const phraseOf = (speakers: readonly GuideEntity[], cue: GuideDialogueCue): Phrase => {
  const speaker = entryById(speakers, cue.speaker_entity_id) ?? null;
  return { cueId: cue.id, start: cue.quote_start, end: cue.quote_end, text: cue.quote_text, speaker, state: cueSpeakerState(cue, speaker) };
};

/**
 * The quoted phrases of a paragraph in reading order, each with its speaker entry. `speakers` are the entries a phrase can be
 * attributed to; the page passes `cueSpeakerEntries`, so a line given to an entry whose type cannot speak counts as unknown.
 */
export function phrasesOf(
  cues: readonly GuideDialogueCue[],
  speakers: readonly GuideEntity[],
  paragraph: Pick<ManuscriptParagraph, 'id' | 'chapterId'>,
): Phrase[] {
  return cues
    .filter((cue) => cue.paragraphId === paragraph.id && cue.chapterId === paragraph.chapterId)
    .map((cue) => phraseOf(speakers, cue))
    .sort((a, b) => a.start - b.start);
}

/** Quoted phrases in a chapter that nothing attributes to one of the `speakers` (see `phrasesOf`). */
export const unattributed = (cues: readonly GuideDialogueCue[], speakers: readonly GuideEntity[], chapterId: string): number =>
  cues.filter((cue) => cue.chapterId === chapterId && phraseOf(speakers, cue).state === 'unknown').length;
