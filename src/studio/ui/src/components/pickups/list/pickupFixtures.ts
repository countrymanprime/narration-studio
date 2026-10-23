// Pickups for the list's tests and stories: several chapters, mixed sources, one done.
import type { PickupItem } from '../../../api/contracts/pickups';
import type { ChapterRef } from './pickupRows';

export const CHAPTERS: ChapterRef[] = [
  { id: 'c1', name: 'Chapter 1 · The Orchard' },
  { id: 'c2', name: 'Chapter 2 · Low Tide' },
  { id: 'c3', name: 'Chapter 3 · Salt' },
];

export function pickup(over: Partial<PickupItem> = {}): PickupItem {
  return {
    id: 'speech:c1:g1',
    chapterId: 'c1',
    paragraphId: 'p3',
    paragraph: 3,
    time: 312,
    at: 312,
    type: 'misread',
    gap: 'misread',
    script: 'She walked past the <b>orchard</b> wall.',
    context: 'She walked past the orchard wall.',
    source: 'speech',
    confidence: 0.91,
    confReason: '',
    included: true,
    done: false,
    waiting: false,
    ...over,
  };
}

export const SPEECH = pickup();
export const NO_SCORE = pickup({
  id: 'speech:c1:g2',
  time: 340.5,
  gap: 'missing',
  type: 'missing',
  confidence: null,
  confReason: 'The engine gave no word scores.',
  script: '…and the gate stood open.',
});
export const EXTRA = pickup({
  id: 'speech:c2:g1',
  chapterId: 'c2',
  time: 61,
  confidence: 0.84,
  gap: 'extra',
  type: 'extra',
  script: 'The tide went <i>out</i> early.',
});
export const AUDIO = pickup({
  id: 'finding:f7',
  chapterId: 'c2',
  time: 95.2,
  gap: undefined,
  type: 'Mouth click',
  source: 'audio',
  confidence: null,
  confReason: 'A sound, not a word.',
  script: 'A click before “Low tide”.',
  findingId: 'f7',
});
export const PROOF = pickup({
  id: 'finding:f9',
  chapterId: 'c3',
  time: 12,
  gap: undefined,
  type: 'Pronunciation',
  source: 'proof',
  confidence: null,
  confReason: 'A note, not a check.',
  script: 'Say <b>Aoife</b> as EE-fa.',
  findingId: 'f9',
});
export const BY_HAND = pickup({
  id: 'you:ab12',
  chapterId: 'c3',
  time: 44,
  gap: undefined,
  type: 'misread',
  source: 'you',
  confidence: null,
  confReason: 'Added by hand.',
  script: '“The salt was thick.”',
});
export const DONE = pickup({ id: 'speech:c1:g3', time: 500, confidence: 0.77, done: true, included: false, script: 'Recorded again already.' });

export const MIXED: PickupItem[] = [SPEECH, NO_SCORE, DONE, EXTRA, AUDIO, PROOF, BY_HAND];
export const ALL_DONE: PickupItem[] = MIXED.map((item) => ({ ...item, done: true, included: false }));
