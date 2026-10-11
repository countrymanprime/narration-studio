// The one list of sample speaker names (ADR 0770): data a builder or a test reads, never a literal inside a component.
// Names and ids follow what api/mockFixtures.ts holds for the Alice book, so a page that swaps a literal for an entry here
// shows the same text. `code` is the short uppercase tag a script line carries.

export interface SampleSpeaker {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export const sampleSpeakers: readonly SampleSpeaker[] = [
  { id: 'alice', code: 'ALICE', name: 'Alice' },
  { id: 'white-rabbit', code: 'RABBIT', name: 'White Rabbit' },
  { id: 'queen-of-hearts', code: 'QUEEN', name: 'Queen of Hearts' },
  { id: 'mad-hatter', code: 'HATTER', name: 'Hatter' },
  { id: 'caterpillar', code: 'CATERPILLAR', name: 'Caterpillar' },
  { id: 'cheshire-cat', code: 'CAT', name: 'Cheshire Cat' },
];

export function sampleSpeakerById(id: string): SampleSpeaker | undefined {
  return sampleSpeakers.find((speaker) => speaker.id === id);
}
