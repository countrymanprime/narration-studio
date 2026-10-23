// The Script page's pure selectors, ported from the Studio Next mock's `selectors/annotations.ts`, `bible.ts`, `phrases.ts`
// and `speakers.ts` onto the host's lists: marks and their types (`marksList`), flagged words (`scriptPrepList`), Story
// Bible entries (`guideEntities`) and dialogue cues (`guideDialogueCues`). Each takes plain lists and returns a new value; none
// mutates its input or reads anything else, so the hooks bind them and a story or test calls them with no host.

import type { GuideDialogueCue, GuideEntity, GuideType } from '../../../../api/contracts/storyBible';
import type { ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import type { Mark, MarkThreadAuthor, MarkType } from '../../../../api/contracts/marks';
import type { ScriptWord, WordStatus } from '../../../../api/contracts/scriptPrep';

/** A flagged word's key as the host stores it: the text trimmed and lower-cased. */
export const wordKey = (text: string): string => text.trim().toLowerCase();

const typeOf = (types: readonly MarkType[], mark: Mark): MarkType | undefined => types.find((type) => type.key === mark.type);

/** A mark whose type asks: a query that tracks a reply. */
export const isAsk = (types: readonly MarkType[], mark: Mark): boolean => typeOf(types, mark)?.asks ?? false;

export const marksInChapter = (marks: readonly Mark[], chapterId: string): Mark[] => marks.filter((mark) => mark.chapterId === chapterId);

/** Queries not yet resolved, in the host's reading order. */
export const openQueries = (types: readonly MarkType[], marks: readonly Mark[]): Mark[] =>
  marks.filter((mark) => isAsk(types, mark) && mark.status !== 'resolved');

/** One message of a mark's thread. The mark's own text is the narrator's opening message, at index -1. */
export type MarkMessage = { who: MarkThreadAuthor; text: string; at: string; index: number };

/** A note and a query are the same thing: a thread on a passage. The opening message is left out when the mark has no text. */
export function markMessages(mark: Mark): MarkMessage[] {
  const opening: MarkMessage[] = mark.text ? [{ who: 'you', text: mark.text, at: '', index: -1 }] : [];
  return [...opening, ...mark.thread.map((message, index) => ({ ...message, index }))];
}

/** Flagged words with at least one flag in the chapter, in the host's order. */
export const wordsInChapter = (words: readonly ScriptWord[], chapterId: string): ScriptWord[] =>
  words.filter((word) => word.flags.some((flag) => flag.chapterId === chapterId));

/** One row of the Words tab: a word flagged in the chapter, or a Story Bible name found in its text. */
export type ChapterWord = { word: string; say: string; source: string; status: WordStatus; fromBible: boolean };

/**
 * Every word the narrator will meet in a chapter with how it is said: the words flagged there, then the Story Bible names in its text
 * that are not flagged (their pronunciation is the entry's, so Set or Not set follows it), each name once, in the order it first appears.
 */
export function chapterWords(
  words: readonly ScriptWord[],
  entries: readonly GuideEntity[],
  chapterId: string,
  paragraphs: readonly Pick<ManuscriptParagraph, 'text'>[],
): ChapterWord[] {
  const flagged: ChapterWord[] = wordsInChapter(words, chapterId).map(({ word, say, source, status }) => ({ word, say, source, status, fromBible: false }));
  const seen = new Set(flagged.map((row) => row.word));
  const rows: ChapterWord[] = [];
  for (const paragraph of paragraphs) {
    for (const mention of mentionsIn(entries, paragraph.text)) {
      const key = wordKey(mention.text);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = entries.find((row) => row.id === mention.entryId);
      const named =
        entry && (wordKey(entry.canonical_name) === key ? entry.pronunciation : entry.aliases.find((alias) => wordKey(alias.text) === key)?.pronunciation);
      const say = named?.ipa.trim() ?? '';
      rows.push({ word: mention.text, say, source: '', status: say ? 'set' : 'not_set', fromBible: true });
    }
  }
  return [...flagged, ...rows];
}

/** The host's status of a word; a word the list lacks is not flagged. */
export const pronStatus = (words: readonly ScriptWord[], text: string): WordStatus =>
  words.find((word) => word.word === wordKey(text))?.status ?? 'not_flagged';

/** How a flagged word is said and where that came from. A value saved with no source was typed by the narrator. */
export function pronOfWord(words: readonly ScriptWord[], text: string): { say: string; source: string } {
  const word = words.find((row) => row.word === wordKey(text));
  return { say: word?.say ?? '', source: word?.say ? word.source || 'manual' : '' };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export type ChapterFactsInput = {
  types: readonly MarkType[];
  marks: readonly Mark[];
  words: readonly ScriptWord[];
  /** Quoted phrases in the chapter that nothing attributes to a speaker (`unattributed`). */
  unattributed: number;
};

/** The "3 marks · 1 open query · 2 without pronunciation" line on a chapter card, as the mock counts it. */
export function chapterFacts(input: ChapterFactsInput, chapterId: string): string {
  const inChapter = marksInChapter(input.marks, chapterId);
  const marks = inChapter.filter((mark) => !isAsk(input.types, mark)).length;
  const queries = inChapter.filter((mark) => isAsk(input.types, mark) && mark.status !== 'resolved').length;
  const unsaid = input.words
    .filter((word) => word.status === 'not_set')
    .reduce((n, word) => n + word.flags.filter((flag) => flag.chapterId === chapterId).length, 0);
  const speakers = input.unattributed ? ` · ${input.unattributed} without a speaker` : '';
  return `${plural(marks, 'mark', 'marks')} · ${queries} open ${queries === 1 ? 'query' : 'queries'} · ${unsaid} without pronunciation${speakers}`;
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
 * whole word only, and case is ignored. A name two entries share belongs to the first in the list.
 */
export function mentionsIn(entries: readonly GuideEntity[], text: string): Mention[] {
  const owner = new Map<string, string>();
  for (const entry of entries) for (const name of namesOf(entry)) if (!owner.has(name.toLowerCase())) owner.set(name.toLowerCase(), entry.id);
  if (owner.size === 0) return [];
  const names = [...owner.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${names.map(escape).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
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

/** A speaker the narrator confirmed (a correction), one the Story Bible suggests, or none. */
type PhraseState = 'confirmed' | 'suggested' | 'unknown';

/** A quoted phrase of a paragraph, from the Story Bible's dialogue cues. */
export type Phrase = { cueId: string; start: number; end: number; text: string; speaker: GuideEntity | null; state: PhraseState };

const phraseOf = (speakers: readonly GuideEntity[], cue: GuideDialogueCue): Phrase => {
  const speaker = entryById(speakers, cue.speaker_entity_id) ?? null;
  const state: PhraseState = !speaker ? 'unknown' : cue.speaker_source === 'correction' ? 'confirmed' : 'suggested';
  return { cueId: cue.id, start: cue.quote_start, end: cue.quote_end, text: cue.quote_text, speaker, state };
};

/**
 * The quoted phrases of a paragraph in reading order, each with its speaker entry. `speakers` are the entries a phrase can be
 * attributed to; the page passes `speakerCandidates`, so a line given to an entry whose type cannot speak counts as unknown.
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
