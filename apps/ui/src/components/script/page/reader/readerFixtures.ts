// Synthetic Script data for the reader's tests and stories. The names are made up on purpose: the reader names no sample
// speaker (ADR 0770, `sampleLiterals.test.ts`), and a story draws what these builders give it.

import type { ManuscriptChapter, ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { ScriptWord } from '../../../../api/contracts/scriptPrep';
import type { GuideDialogueCue, GuideDialogueCueSpeakerSource, GuideEntity } from '../../../../api/contracts/storyBible';

export const TYPES: readonly MarkType[] = [
  { key: 'note', name: 'Note', colour: 'info', style: 'underline', asks: false },
  { key: 'ask', name: 'Query', colour: 'warn', style: 'wavy', asks: true },
  { key: 'stress', name: 'Stress', colour: 'copper', style: 'highlight', asks: false },
  { key: 'pause', name: 'Pause', colour: 'ok', style: 'double', asks: false },
  { key: 'breath', name: 'Breath', colour: 'violet', style: 'dotted', asks: false },
  { key: 'redo', name: 'Re-record', colour: 'bad', style: 'box', asks: false },
];

type Span = { start: number; end: number };

export const chapter = (id: string, index: number, title = `Chapter ${index + 1}`): ManuscriptChapter => ({
  id,
  title,
  index,
  wordCount: 120,
  status: 'not_started',
});

export const paragraph = (id: string, chapterId: string, text: string, index = 0): ManuscriptParagraph => ({
  id,
  chapterId,
  chapter: chapterId,
  index,
  text,
  entityIds: [],
});

export const entry = (id: string, name: string, category: string, speakerColor?: number): GuideEntity => ({
  id,
  canonical_name: name,
  aliases: [],
  category,
  occurrences: [],
  occurrence_count: 0,
  pronunciation: { ipa: '', source: '', confidence: '' },
  description: { text: '', evidence: {} },
  personality_notes: [],
  relationships: [],
  properties: [],
  locked: false,
  review_state: 'reviewed',
  speaker_color: speakerColor,
});

export const cue = (
  id: string,
  paragraphId: string,
  chapterId: string,
  span: Span,
  speaker: string | null,
  source: GuideDialogueCueSpeakerSource,
): GuideDialogueCue => ({
  id,
  chapterId,
  paragraphId,
  quote_start: span.start,
  quote_end: span.end,
  quote_text: '',
  speaker_entity_id: speaker,
  speaker_source: source,
  evidence: { chapterId, paragraphId, excerpt: '', tag: '' },
  corrected: source === 'correction',
});

export const mark = (id: string, paragraphId: string, span: Span, type: string, extra: Partial<Mark> = {}): Mark => ({
  id,
  chapterId: 'c1',
  paragraphId,
  paragraph: 0,
  ...span,
  quote: '',
  type,
  text: type === 'note' ? 'A note' : '',
  status: type === 'ask' ? 'open' : undefined,
  thread: [],
  createdAt: '2026-10-11T00:00:00Z',
  stale: false,
  ...extra,
});

export const flaggedWord = (word: string, paragraphId: string, span: Span, status: ScriptWord['status'] = 'not_set'): ScriptWord => ({
  word,
  say: '',
  source: '',
  status,
  flags: [{ id: `f-${word}`, chapterId: 'c1', paragraphId, paragraph: 0, ...span, quote: word, createdAt: '2026-10-11T00:00:00Z', stale: false }],
});
