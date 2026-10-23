import { typeHueColour, type EntityColour } from '../../../kinds/entityColour';
import type { ParagraphNote, ReadingParagraph, WordDecoration } from './boothUnits';

// Sample chapter for the tests and stories: narration, a suggested speaker, a confirmed one and a continued quotation.
const quote = '“Off with her head,” said the Queen. “Not yet. Dr. Smith is late.”';
const first = quote.indexOf('”') + 1;
const second = quote.indexOf('“', first);
export const sampleParagraphs: ReadingParagraph[] = [
  { id: 'p1', text: 'The garden was quiet. Nobody had come down since the morning.' },
  {
    id: 'p2',
    text: quote,
    phrases: [
      { key: 'p2:0', start: 0, end: first, quoted: true, speaker: 'Queen', confirmed: false },
      { key: `p2:${first}`, start: first, end: second, quoted: false, speaker: '', confirmed: true },
      { key: `p2:${second}`, start: second, end: quote.length, quoted: true, speaker: 'Alice', confirmed: true },
    ],
  },
  { id: 'p3', text: 'She turned and walked away.' },
];

export const sampleSpeakers = ['Alice', 'Queen', 'King'];
export const sampleColour = (speaker: string): EntityColour | undefined =>
  speaker === 'Queen' ? typeHueColour('violet') : speaker === 'Alice' ? typeHueColour('green') : undefined;
export const sampleDecorations: WordDecoration[] = [{ paragraphId: 'p1', start: 4, end: 10, kind: 'entity', colour: typeHueColour('blue'), title: 'Garden' }];
export const sampleNotes: ParagraphNote[] = [{ id: 'n1', paragraphId: 'p3', name: 'Pace', text: 'slow down', colour: 'ok' }];
