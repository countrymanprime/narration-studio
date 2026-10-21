import type { HeardAnswer, HeardWord } from '../../../ports/alignment';
import type { ChapterDoc } from '../model';
import { docFromHeard, type TextParagraph } from '../script/docFromHeard';

/**
 * A chapter whose second paragraph runs exactly 5.0 to 7.7 s with nine words of 0.3 s and no gap between them, so a range drawn on its
 * waveform lands on times a reader can add up: Alice 5.0-5.3, was 5.3-5.6, tired 5.6-5.9, of 5.9-6.2, sitting 6.2-6.5, quietly 6.5-6.8,
 * by 6.8-7.1, her 7.1-7.4, sister 7.4-7.7. The first paragraph is one long word that puts the second where it starts.
 */
const RANGE_PARAS: TextParagraph[] = [
  { id: 'p-0', text: 'Prologue' },
  { id: 'p-1', text: 'Alice was tired of sitting quietly by her sister' },
  { id: 'p-2', text: 'Once or twice she had peeped' },
];

const ENGINE = { id: 'whisper:small', name: 'Whisper small' };

function answer(): HeardAnswer {
  const words: HeardWord[] = [{ text: 'Prologue', paragraphId: 'p-0', ordinal: 0, item: 0, off0: 0, off1: 3.55, conf: 0.95 }];
  RANGE_PARAS.slice(1).forEach((p, pi) => {
    p.text
      .split(' ')
      .forEach((text, i) =>
        words.push({ text, paragraphId: p.id, ordinal: i, item: 0, off0: 10 * (pi + 1) + i * 0.3, off1: 10 * (pi + 1) + (i + 1) * 0.3, conf: 0.95 }),
      );
  });
  return { heard: { engine: ENGINE, words } };
}

export const rangeDoc = (extras?: Parameters<typeof docFromHeard>[2]): ChapterDoc => docFromHeard(RANGE_PARAS, answer(), extras);
