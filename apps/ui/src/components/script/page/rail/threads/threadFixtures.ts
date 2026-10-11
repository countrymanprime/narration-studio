import type { Mark, MarkType } from '../../../../../api/contracts/marks';
import type { NoteActions } from './NoteCard';

// Marks for the stories: the six types a project starts with (`api/marksMock.ts`) and a few marks over the first chapter.

export const TYPES: MarkType[] = [
  { key: 'stress', name: 'Word stress', colour: 'copper', style: 'highlight', asks: false },
  { key: 'breath', name: 'Breath / pause', colour: 'info', style: 'dotted', asks: false },
  { key: 'pace', name: 'Pace', colour: 'ok', style: 'wavy', asks: false },
  { key: 'emo', name: 'Emotion', colour: 'bad', style: 'underline', asks: false },
  { key: 'note', name: 'Note', colour: 'violet', style: 'double', asks: false },
  { key: 'ask', name: 'Query for author', colour: 'warn', style: 'highlight', asks: true },
];

const base = { chapterId: 'chapter-1', start: 0, end: 5, stale: false, createdAt: '2026-10-09T09:00:00Z' } as const;

export const NOTE: Mark = {
  ...base,
  id: 'm1',
  paragraphId: 'p-1',
  paragraph: 0,
  quote: 'Alice',
  type: 'stress',
  text: 'Lean on the first syllable.',
  thread: [],
};

export const OPEN_QUERY: Mark = {
  ...base,
  id: 'm2',
  paragraphId: 'p-2',
  paragraph: 1,
  quote: 'the pleasure of making a daisy-chain',
  type: 'ask',
  text: 'Is this the live animals or the stuffed ones?',
  status: 'open',
  thread: [{ who: 'author', text: 'The live ones, in the garden.', at: '2026-10-10T14:30:00Z' }],
};

export const RESOLVED_QUERY: Mark = {
  ...base,
  id: 'm3',
  paragraphId: 'p-3',
  paragraph: 2,
  quote: 'Rabbit',
  type: 'ask',
  text: 'Does Rabbit take a long or a short a?',
  status: 'resolved',
  thread: [
    { who: 'author', text: 'Short, as in "rabbit".', at: '2026-10-10T15:00:00Z' },
    { who: 'you', text: 'Thanks, noted in the Story Bible.', at: '2026-10-10T15:10:00Z' },
  ],
};

export const lineOf = (mark: Mark): string => `Chapter 1 · ¶ ${(mark.paragraph ?? 0) + 1}`;

/** Actions that do nothing; a story passes `fn()` rows over them when it asserts a call. */
export const NO_ACTIONS: NoteActions = {
  onType: () => undefined,
  onShow: () => undefined,
  onCopy: () => undefined,
  onDelete: () => undefined,
  onReply: async () => true,
  onResolve: async () => true,
  onReopen: () => undefined,
  onEdit: () => undefined,
  onCancelEdit: () => undefined,
  onSaveEdit: async () => true,
  onDeleteMessage: () => undefined,
};
