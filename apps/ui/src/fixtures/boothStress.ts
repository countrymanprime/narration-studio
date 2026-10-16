import type { ManuscriptChapter, ManuscriptParagraph } from '../types';
import type { TeleprompterDevice } from '../api/contracts/teleprompter';
import { makeChapters, makeParagraphs } from './chapters';

// Seeds for the Booth's worst cases (`?mockBooth=`, `?mockMics=`): a book far bigger than anyone has, titles and text in scripts and
// symbols the layout was not drawn for, and microphones with names no vendor would ship. Pure and deterministic: no clock, no random value.

export const BOOTH_STRESS = ['long-chapter', 'huge-chapter', 'many-chapters', 'emoji', 'rtl', 'odd-titles'] as const;
export type BoothStress = (typeof BOOTH_STRESS)[number];
export const MIC_STRESS = ['0', '1', '50', 'weird', 'long'] as const;
export type MicStress = (typeof MIC_STRESS)[number];

type Book = { chapters: ManuscriptChapter[]; paragraphs: ManuscriptParagraph[] };

const paragraph = (chapter: ManuscriptChapter, index: number, local: number, text: string): ManuscriptParagraph => ({
  id: `p-${index + 1}`,
  chapterId: chapter.id,
  chapter: chapter.title,
  index: local,
  sourceLine: 10 + index,
  text,
  entityIds: [],
});

/** `words` words in sentences of twelve, so the reader has real phrases to step through. */
function prose(words: number, seed: string): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(`${seed}${i + 1}${(i + 1) % 12 === 0 ? '.' : ''}`);
  return out.join(' ');
}

function chapterOf(index: number, title: string, subtitle: string | undefined, wordCount: number): ManuscriptChapter {
  return { id: `chapter-${index + 1}`, title, ...(subtitle === undefined ? {} : { subtitle }), index, wordCount, status: 'not_started' };
}

/** One chapter of `paragraphs` paragraphs of a hundred words each, and a short second one. */
function longChapter(paragraphs: number): Book {
  const chapters = [chapterOf(0, 'Chapter 1', 'The Very Long One', paragraphs * 100), chapterOf(1, 'Chapter 2', 'A Short One', 40)];
  return {
    chapters,
    paragraphs: [
      ...Array.from({ length: paragraphs }, (_, i) => paragraph(chapters[0], i, i, prose(100, 'word'))),
      paragraph(chapters[1], paragraphs, 0, 'The end, at last. Nothing more to say.'),
    ],
  };
}

/** Five thousand chapters of three short paragraphs each. */
function manyChapters(): Book {
  const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 5000 });
  return { chapters, paragraphs: makeParagraphs(chapters, { perChapter: 3 }) };
}

const EMOJI_TITLES = ['🎩🐇🕳️', '👩🏽‍❤️‍💋‍👨🏿 and 🏳️‍🌈', '🫖🫖🫖🫖🫖🫖🫖🫖🫖🫖🫖🫖🫖🫖', '🧑‍🧑‍🧒‍🧒', '🇬🇧🇮🇱🇯🇵'];
const RTL_TITLES = ['פרק ראשון – הארנב הלבן', 'الفصل الثاني: بركة الدموع', 'Chapter ٣ – עברית and English mixed 123', 'שלום‏ (LRM/RLM) ‎Hello', 'فصل 4'];
const ODD_TITLES = [
  'A "quoted" title with \'single\' quotes',
  '<b>not bold</b> & <script>alert(1)</script>',
  `${'Very long title word '.repeat(30)}end`,
  'Line one\nline two\r\nline three',
  'Ünïcödé — “smart” … ‘quotes’ ¶ § † ‡ \u0000 nul',
];

function titled(titles: readonly string[], texts: readonly string[]): Book {
  const chapters = titles.map((title, i) => chapterOf(i, title, undefined, 60));
  const paragraphs = chapters.flatMap((chapter, i) => texts.map((text, j) => paragraph(chapter, i * texts.length + j, j, text)));
  return { chapters, paragraphs };
}

const EMOJI_TEXT = ['Alice 🐇 fell 🕳️ down 😮‍💨 the hole. “Oh dear!” 😱 she said.', '🫖 Tea at six. 🎩 The Hatter 👨🏽‍🦱 poured. 🥄'];
const RTL_TEXT = ['אליס נפלה במורד חור הארנב. “הו, אלוהים!” אמרה. She said it twice: שלום עולם.', 'سقطت أليس في جحر الأرنب. قالت: «يا إلهي!» ثم صمتت قليلاً.'];
const ODD_TEXT = [
  '“Quoted,” she said — \'single\' and "double". <i>tags</i> &amp; entities &#169;.',
  `${'longwordwithoutanybreaks'.repeat(12)} then a normal sentence. Done.`,
];

export function boothStressSeed(name: BoothStress): Book {
  switch (name) {
    case 'long-chapter':
      return longChapter(120);
    case 'huge-chapter':
      return longChapter(1000);
    case 'many-chapters':
      return manyChapters();
    case 'emoji':
      return titled(EMOJI_TITLES, EMOJI_TEXT);
    case 'rtl':
      return titled(RTL_TITLES, RTL_TEXT);
    case 'odd-titles':
      return titled(ODD_TITLES, ODD_TEXT);
  }
}

/** The microphones a machine can list: none, one, fifty, names with quotes, newlines, right-to-left text and emoji, and one of 300 characters. */
export function micStressDevices(name: MicStress): TeleprompterDevice[] {
  switch (name) {
    case '0':
      return [];
    case '1':
      return [{ name: 'Only Microphone (USB)' }];
    case '50':
      return Array.from({ length: 50 }, (_, i) => ({ name: `Microphone ${i + 1} (Interface ${i + 1} USB Audio)` }));
    case 'weird':
      return [
        { name: 'Mic "Studio" \'A\'\nsecond line' },
        { name: 'מיקרופון – ראשי 🎙️' },
        { name: 'ميكروفون 🎤 (USB)' },
        { name: '<b>bold</b> & <script>x</script>' },
        { name: '  leading and trailing spaces  ' },
      ];
    case 'long':
      return [{ name: `Long ${'microphone name '.repeat(19)}end` }];
  }
}
