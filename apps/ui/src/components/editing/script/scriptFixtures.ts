import type { HeardAnswer, HeardWord } from '../../../ports/alignment';
import type { ChapterDoc } from '../model';
import { docFromHeard, type TextParagraph } from './docFromHeard';

/** Hand-built chapters for the tests and the stories: a document is never fetched from a host here. */
export const PARAS: TextParagraph[] = [
  { id: 'p-1', text: 'Alice was very tired of sitting by her sister.' },
  { id: 'p-2', text: 'Once or twice she had peeped into the book.' },
];

const ENGINE = { id: 'whisper:small', name: 'Whisper small' };

let clock = 0;
const word = (text: string, paragraphId: string | undefined, ordinal: number | undefined, conf = 0.95): HeardWord => {
  const off0 = clock;
  clock += 0.3;
  return { text, ...(paragraphId ? { paragraphId, ordinal } : { added: true as const, timing: 'spread' as const }), item: 0, off0, off1: clock, conf };
};

/** p-1 has an extra word ("um"), a word not read ("very"), a misread ("sister." heard as "sitter") and a low-confidence word ("tired"). */
function marksAnswer(): HeardAnswer {
  clock = 5;
  const p1 = ['Alice', 'was', 'tired', 'of', 'sitting', 'by', 'her', 'sitter'];
  const p1Ord = [0, 1, 3, 4, 5, 6, 7, 8];
  const words: HeardWord[] = p1.map((t, i) => word(t, 'p-1', p1Ord[i], t === 'tired' ? 0.5 : 0.95));
  words.splice(5, 0, word('um', undefined, undefined, 0.9));
  const p2 = PARAS[1].text.split(' ');
  p2.forEach((t, i) => words.push(word(t, 'p-2', i)));
  return { heard: { engine: ENGINE, words } };
}

export const notTranscribed = (): HeardAnswer => ({ heard: null, reason: 'Nothing has been transcribed yet: run the check on this chapter.', reasons: [] });

export const marksDoc = (extras?: Parameters<typeof docFromHeard>[2]): ChapterDoc => docFromHeard(PARAS, marksAnswer(), extras);

/** A chapter of `words` words in paragraphs of 50, every tenth word misread or dropped by a fixed-seed generator (ADR 0044). */
export function syntheticChapter(words: number, seed = 1044): { paragraphs: TextParagraph[]; answer: HeardAnswer } {
  let s = seed;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const paragraphs: TextParagraph[] = [];
  const heard: HeardWord[] = [];
  clock = 0;
  for (let p = 0; p < Math.ceil(words / 50); p++) {
    const id = `s-${p}`;
    const text: string[] = [];
    for (let i = 0; i < Math.min(50, words - p * 50); i++) {
      const w = `word${Math.floor(rand() * 900) + 100}`;
      text.push(w);
      const r = rand();
      if (r < 0.05) continue;
      heard.push(word(r < 0.1 ? `${w}x` : w, id, i, r < 0.15 ? 0.4 : 0.95));
    }
    paragraphs.push({ id, text: text.join(' ') });
  }
  return { paragraphs, answer: { heard: { engine: ENGINE, words: heard } } };
}
