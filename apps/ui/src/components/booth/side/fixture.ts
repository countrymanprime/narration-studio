import type { Mark, Marks } from '../../../api/contracts/marks';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { BoothUnit, ReadingParagraph } from '../reading/boothUnits';
import { voicesNearby, comingUpWords } from './nearby';
import type { BoothSideData } from './sections';

const note = (text: string) => ({ text, evidence: {} });
const pron = (ipa: string) => ({ ipa, source: 'cmu', confidence: 'high' });
const entity = (id: string, canonical_name: string, category: string, extra: Partial<GuideEntity> = {}): GuideEntity => ({
  id,
  canonical_name,
  aliases: [],
  category,
  occurrences: [],
  occurrence_count: 1,
  pronunciation: pron(''),
  description: note(''),
  personality_notes: [],
  relationships: [],
  properties: [],
  locked: false,
  review_state: 'reviewed',
  ...extra,
});

export const queen = entity('e-queen', 'Queen', 'Character', {
  aliases: [{ text: 'Her Majesty', pronunciation: pron('hɜː ˈmædʒəsti'), occurrences: [] }],
  description: note('Rules the court with a short temper.'),
  personality_notes: [note('Clipped and loud.'), note('Never asks twice.')],
  pronunciation: pron('kwiːn'),
});
export const garden = entity('e-garden', 'Garden', 'Place', { description: note('The walled rose garden.'), pronunciation: pron('ˈɡɑːdən') });
const alice = entity('e-alice', 'Alice', 'Character');
export const entities = [queen, garden, alice];

export const paragraphs: ReadingParagraph[] = [
  { id: 'p1', text: 'The Garden was quiet. Nobody had come down since the morning.' },
  { id: 'p2', text: '“Off with her head,” said the Queen. “Not yet,” said Alice.' },
];

const unit = (n: number, paragraphIndex: number, text: string, speaker: string, quoted: boolean): BoothUnit => ({
  key: `u${n}`,
  paragraphId: `p${paragraphIndex + 1}`,
  paragraphIndex,
  start: 0,
  end: text.length,
  speaker,
  quoted,
  confirmed: true,
  text,
  words: text.split(/\s+/).length,
  cont: false,
});
const units: BoothUnit[] = [
  unit(0, 0, 'The Garden was quiet. ', '', false),
  unit(1, 1, '“Off with her head,” said the Queen. ', 'Queen', true),
  unit(2, 1, '“Not yet,” said Alice.', 'Alice', true),
];

const mark = (over: Partial<Mark> & Pick<Mark, 'id' | 'paragraphId' | 'start' | 'end' | 'quote' | 'type'>): Mark => ({
  chapterId: 'c1',
  paragraph: 1,
  text: '',
  thread: [],
  createdAt: '',
  stale: false,
  ...over,
});

/** The chapter's marks: a stressed name with a note and a reply, a pause with no note, a stale mark and an open question. */
export const marks: Marks = {
  types: [
    { key: 'stress', name: 'Word stress', colour: 'copper', style: 'highlight', asks: false },
    { key: 'breath', name: 'Breath / pause', colour: 'info', style: 'dotted', asks: false },
    { key: 'ask', name: 'Query for author', colour: 'warn', style: 'highlight', asks: true },
  ],
  marks: [
    mark({
      id: 'm1',
      paragraphId: 'p1',
      start: 4,
      end: 10,
      quote: 'Garden',
      type: 'stress',
      text: 'lean on it',
      thread: [{ who: 'author', text: 'yes', at: '2026-10-01T10:00:00Z' }],
    }),
    mark({ id: 'm2', paragraphId: 'p1', start: 11, end: 14, quote: 'was', type: 'breath' }),
    mark({ id: 'm3', paragraphId: 'p2', paragraph: 2, start: 1, end: 4, quote: 'Off', type: 'stress', text: 'gone', stale: true }),
    mark({ id: 'm4', paragraphId: 'p2', paragraph: 2, start: 42, end: 45, quote: 'yet', type: 'ask', text: 'Stressed?', status: 'open' }),
  ],
};

export function sideData(overrides: Partial<BoothSideData> = {}): BoothSideData {
  return {
    chapterId: 'c1',
    reference: null,
    voices: voicesNearby(units, 1, entities),
    comingUp: comingUpWords(units, 0, entities),
    numbers: { recordedSeconds: 75, punches: 0 },
    flags: [],
    onOpenEntry: () => undefined,
    ...overrides,
  };
}
