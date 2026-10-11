import type { PronunciationSource } from '../../../../../api/contracts/pronunciationSources';
import type { GuideEntity } from '../../../../../api/contracts/storyBible';

// Story Bible entries for the stories: a character with a spoken alias, and a place.

const value = (ipa: string, source: string) => ({ ipa, source, confidence: 'high' });

export const SOURCES: PronunciationSource[] = [
  { id: 'cmu', label: 'Local dictionary', kind: 'lookup', available: true },
  { id: 'espeak', label: 'Spelling rules', kind: 'generated', available: true },
  { id: 'manual', label: 'My own entry', kind: 'manual', available: true },
];

const entry = (over: Partial<GuideEntity> & Pick<GuideEntity, 'id' | 'canonical_name' | 'category'>): GuideEntity => ({
  aliases: [],
  occurrences: [],
  occurrence_count: 0,
  pronunciation: value('', ''),
  description: { text: '', evidence: {} },
  personality_notes: [],
  relationships: [],
  properties: [],
  locked: false,
  review_state: 'confirmed',
  ...over,
});

export const ALICE = entry({
  id: 'alice',
  canonical_name: 'Alice',
  category: 'Character',
  aliases: [{ text: 'Alice Liddell', pronunciation: value('/ˈælɪs lɪˈdɛl/', 'manual'), occurrences: [] }],
  pronunciation: value('/ˈælɪs/', 'cmu'),
  description: { text: 'A curious child whose changing size drives the story.', evidence: {} },
  properties: [
    { key: 'Says', value: 'Politely, and too much.' },
    { key: 'Does', value: 'Follows whatever is curious.' },
  ],
  appearances: [{ chapterId: 'chapter-1', chapter: 'Down the Rabbit-Hole', sceneIndex: 0 }],
});

export const GARDEN = entry({
  id: 'garden',
  canonical_name: 'Queen’s garden',
  category: 'Place',
  pronunciation: value('/kwiːnz ˈɡɑːrdən/', 'espeak'),
  description: { text: 'The croquet ground.', evidence: {} },
  appearances: [{ chapterId: 'chapter-8', chapter: 'The Queen’s Croquet-Ground', sceneIndex: 0 }],
});
