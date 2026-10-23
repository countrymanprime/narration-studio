import { clockText } from '../../booth/boothProgress';
import { selKeys, summarize, type ChapterDoc, type Sel } from '../model';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What the narrator hears of a selection said aloud: "3 words selected, 0:12 to 0:14", and "not in the script" when every word is extra. */
export function announceSel(doc: ChapterDoc, sel: Sel | null): string {
  if (!sel) return '';
  const sum = summarize(doc, selKeys(doc, sel), [], (s) => s);
  const span = sum.audible.length ? `, ${clockText(sum.start)} to ${clockText(sum.end)}` : '';
  return `${plural(sum.items.length, 'word', 'words')} selected${span}${sum.allExtra ? ', not in the script' : ''}`;
}

/** What the narrator hears when the cursor lands on a word: the word, and "not in the script" for one that was only said. */
export function announceWord(doc: ChapterDoc, key: string | null): string {
  const item = key === null ? undefined : doc.items[doc.index.get(key) ?? -1];
  if (!item) return '';
  return item.kind === 'x' ? `${item.text}, not in the script` : item.text;
}
