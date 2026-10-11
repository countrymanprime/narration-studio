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
