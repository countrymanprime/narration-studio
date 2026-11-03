/**
 * What the mock rules provider finds in the sample book. Fixture data only: the quotes are looked up in the manuscript by code
 * (verifyEvidence), so the offsets are real. A mix on purpose: confident, under the threshold, no confidence, and a quote
 * that is not in the text.
 */
import type { RawSuggestion } from '@/state/extractionCore'

const q = (paragraphId: string, text: string) => [{ paragraphId, text }]

export const RULES_FINDINGS: RawSuggestion[] = [
  { payload: { kind: 'entry', name: 'The Dodo', type: 'Character', aliases: ['Dodo'], description: 'Presents the thimble as the prize.', appearsIn: [] }, confidence: 0.91, quotes: q('3-4', 'Then the Dodo solemnly presented the thimble') },
  { payload: { kind: 'entry', name: 'The Mouse', type: 'Character', aliases: ['Mouse'], description: 'Calls the party to sit down and dry off.', appearsIn: [] }, confidence: 0.62, quotes: q('3-3', 'the Mouse, who seemed to be a person of some authority') },
  { payload: { kind: 'alias', entry: 'White Rabbit', alias: 'Rabbit' }, confidence: 0.66, quotes: q('8-12', 'Alice recognised the White Rabbit') },
  { payload: { kind: 'alias', entry: 'Knave of Hearts', alias: 'The Knave' }, confidence: 0.88, quotes: q('8-12', 'Then followed the Knave of Hearts') },
  { payload: { kind: 'property', entry: 'Caterpillar', key: 'Habit', value: 'Smokes a hookah' }, confidence: 0.93, quotes: q('5-1', 'the Caterpillar took the hookah out of its mouth') },
  { payload: { kind: 'property', entry: 'Queen of Hearts', key: 'Temper', value: 'Shouts her sentences' }, confidence: 0.81, quotes: q('8-13', 'the Queen shouted at the top of her voice') },
  { payload: { kind: 'property', entry: 'Alice', key: 'Manner', value: 'Polite' }, confidence: 0.7, quotes: q('5-7', 'Alice replied very politely') },
  { payload: { kind: 'property', entry: 'Duchess', key: 'Mood', value: 'Pleasant in this chapter' }, confidence: 0.58, quotes: q('9-2', 'Alice was very glad to find her in such a pleasant temper') },
  { payload: { kind: 'claim', entry: 'Queen of Hearts', claim: 'talk', text: 'Orders heads cut off' }, confidence: 0.95, quotes: q('8-13', '“Off with her head!” the Queen shouted') },
  { payload: { kind: 'claim', entry: 'Caterpillar', claim: 'talk', text: 'Speaks sternly' }, confidence: 0.9, quotes: q('5-4', 'said the Caterpillar sternly') },
  { payload: { kind: 'claim', entry: 'Duchess', claim: 'talk', text: 'Finds a moral in everything' }, confidence: 0.9, quotes: q('9-1', 'every pig has a moral') },
  { payload: { kind: 'claim', entry: 'The gardeners', claim: 'act', text: 'Throw themselves flat on their faces when the Queen comes' }, confidence: 0.9, quotes: q('8-11', 'threw themselves flat upon their faces'), chapterId: '8' },
  { payload: { kind: 'claim', entry: 'White Rabbit', claim: 'act', text: 'Smiles at everything that is said' }, confidence: 0.84, quotes: q('8-12', 'smiling at everything that was said'), chapterId: '8' },
  { payload: { kind: 'claim', entry: 'The gardeners', claim: 'know', text: 'They put a white rose-tree in by mistake' }, confidence: 0.88, quotes: q('8-10', 'we put a white one in by mistake'), chapterId: '8' },
  { payload: { kind: 'claim', entry: 'Alice', claim: 'know', text: 'Knows who she was this morning, not who she is now' }, confidence: 0.72, quotes: q('5-3', 'at least I know who I was when I got up this morning'), chapterId: '5' },
  { payload: { kind: 'claim', entry: 'King of Hearts', claim: 'know', text: 'Knows how to manage the Queen' }, confidence: null, quotes: [] },
  { payload: { kind: 'relationship', entry: 'Knave of Hearts', to: 'King of Hearts', relation: 'carries the crown of' }, confidence: 0.86, quotes: q('8-12', 'the Knave of Hearts, carrying the King’s crown') },
  { payload: { kind: 'speaker', quote: '“Who are these?”', speaker: 'Queen of Hearts' }, confidence: 0.68, quotes: q('8-14', '“Who are these?”') },
]

/** The local model the mock host reports: not installed, so running it says why not. */
export const LOCAL_MODEL_STATE = { installed: false, reason: 'No local model is installed.' }

/* ---- The optional analysis tools. Shaped like what was measured on the Alice trial (research 9 and 9.9). ---- */

/** GLiNER: candidate names only (characters, places, things), no aliases or speakers; it also labels some things that are not characters. */
export const GLINER_FINDINGS: RawSuggestion[] = [
  { payload: { kind: 'entry', name: 'The soldiers', type: 'Character', aliases: ['soldiers'], description: 'Carry clubs in the procession.', appearsIn: [] }, confidence: 0.86, quotes: q('8-12', 'First came ten soldiers carrying clubs') },
  { payload: { kind: 'entry', name: 'The rose-tree', type: 'Item', aliases: ['rose-tree'], description: 'Painted red by the gardeners.', appearsIn: [] }, confidence: 0.82, quotes: q('8-1', 'A large rose-tree stood near the entrance of the garden') },
  { payload: { kind: 'entry', name: 'The croquet-ground', type: 'Location', aliases: ['croquet-ground'], description: 'All ridges and furrows.', appearsIn: [] }, confidence: 0.84, quotes: q('8-16', 'such a curious croquet-ground') },
  { payload: { kind: 'entry', name: 'The kitchen', type: 'Location', aliases: ['kitchen'], description: 'Where Alice met the Duchess.', appearsIn: [] }, confidence: 0.77, quotes: q('9-2', 'when they met in the kitchen') },
  { payload: { kind: 'entry', name: 'The flamingoes', type: 'Item', aliases: ['flamingoes'], description: 'Used as mallets.', appearsIn: [] }, confidence: 0.71, quotes: q('8-16', 'the mallets live flamingoes') },
  { payload: { kind: 'entry', name: 'The pepper', type: 'Item', aliases: ['pepper'], description: 'Makes the Duchess savage.', appearsIn: [] }, confidence: 0.64, quotes: q('9-2', 'it was only the pepper') },
  { payload: { kind: 'entry', name: 'The hedgehog', type: 'Character', aliases: ['hedgehog'], description: '', appearsIn: [] }, confidence: 0.52, quotes: q('8-16', 'the croquet-balls were live hedgehogs') },
]

export type BookNlpVariant = 'small' | 'big'
/** A BookNLP finding with the confidence each variant gives it (null: that variant does not report it). Speakers are sure when a dialogue tag names them. */
export type BookNlpFinding = Omit<RawSuggestion, 'confidence'> & { conf: Record<BookNlpVariant, number | null> }
const both = (small: number, big: number = small): Record<BookNlpVariant, number> => ({ small, big })

export const BOOKNLP_FINDINGS: BookNlpFinding[] = [
  /* Speakers: high when the line has a tag ("said the Caterpillar"), low when it is implicit. */
  { payload: { kind: 'speaker', quote: '“Who are you?”', speaker: 'Caterpillar' }, conf: both(0.97, 0.99), quotes: q('5-2', '“Who are you?”') },
  { payload: { kind: 'speaker', quote: '“What do you mean by that?”', speaker: 'Caterpillar' }, conf: both(0.96, 0.99), quotes: q('5-4', '“What do you mean by that?”') },
  { payload: { kind: 'speaker', quote: '“I can’t explain myself, I’m afraid, sir,”', speaker: 'Alice' }, conf: both(0.97, 0.99), quotes: q('5-5', '“I can’t explain myself, I’m afraid, sir,”') },
  { payload: { kind: 'speaker', quote: '“I don’t see,”', speaker: 'Caterpillar' }, conf: both(0.95, 0.99), quotes: q('5-6', '“I don’t see,”') },
  { payload: { kind: 'speaker', quote: '“Serpent!”', speaker: 'The Pigeon' }, conf: both(0.94, 0.98), quotes: q('5-15', '“Serpent!”') },
  { payload: { kind: 'speaker', quote: '“I couldn’t help it,”', speaker: 'Five' }, conf: both(0.95, 0.98), quotes: q('8-2', '“I couldn’t help it,”') },
  { payload: { kind: 'speaker', quote: '“Would you tell me,”', speaker: 'Alice' }, conf: both(0.95, 0.98), quotes: q('8-9', '“Would you tell me,”') },
  { payload: { kind: 'speaker', quote: '“Off with her head!”', speaker: 'Queen of Hearts' }, conf: both(0.97, 0.99), quotes: q('8-13', '“Off with her head!”') },
  { payload: { kind: 'speaker', quote: '“Yes!”', speaker: 'Alice' }, conf: both(0.95, 0.98), quotes: q('8-15', '“Yes!”') },
  { payload: { kind: 'speaker', quote: '“You can’t think how glad I am to see you again, you dear old thing!”', speaker: 'Duchess' }, conf: both(0.96, 0.99), quotes: q('9-1', '“You can’t think how glad I am to see you again, you dear old thing!”') },
  { payload: { kind: 'speaker', quote: '“Can you play croquet?”', speaker: 'Queen of Hearts' }, conf: { small: 0.52, big: 0.71 }, quotes: q('8-15', '“Can you play croquet?”') },
  /* Entries and the names they go by. */
  { payload: { kind: 'entry', name: 'The Pigeon', type: 'Character', aliases: [], description: 'Takes Alice for a serpent.', appearsIn: [] }, conf: both(0.9, 0.93), quotes: q('5-15', 'screamed the Pigeon') },
  { payload: { kind: 'alias', entry: 'The gardeners', alias: 'the three gardeners' }, conf: both(0.9, 0.92), quotes: q('8-11', 'the three gardeners') },
  /* One group of mentions split in two: the second is offered as a name of the first, flagged. */
  { payload: { kind: 'alias', entry: 'The Pigeon', alias: 'Pigeon' }, conf: both(0.58, 0.6), quotes: q('5-15', 'screamed the Pigeon'), flag: 'duplicate', note: 'Possible duplicate of The Pigeon: the mentions were found in two separate groups.' },
  /* Groups that are not characters. */
  { payload: { kind: 'entry', name: 'The royal children', type: 'Character', aliases: [], description: '', appearsIn: [] }, conf: both(0.56, 0.6), quotes: q('8-12', 'the royal children') },
  /* Gender from pronouns, and how sure the model is. */
  { payload: { kind: 'property', entry: 'Duchess', key: 'Gender', value: 'Female' }, conf: both(0.93, 0.97), quotes: q('9-1', 'as she tucked her arm affectionately into Alice’s') },
  { payload: { kind: 'property', entry: 'Alice', key: 'Gender', value: 'Female' }, conf: both(0.92, 0.95), quotes: q('7-2', 'she thought') },
  { payload: { kind: 'property', entry: 'Caterpillar', key: 'Gender', value: 'Male' }, conf: both(0.55, 0.62), quotes: q('5-1', 'took the hookah out of its mouth') },
]
