import { normKey } from '../model';

/** A word of the take's reading set against the script: as written, left out of the take (`del`) or added by it (`ins`). */
export interface WordPart {
  k: 'same' | 'del' | 'ins';
  w: string;
}

const wordsOf = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** What the take said against the script, word by word (longest common run of words, case and punctuation ignored). */
export function takeDiff(script: string, said: string): WordPart[] {
  const a = wordsOf(script);
  const b = wordsOf(said);
  const ka = a.map(normKey);
  const kb = b.map(normKey);
  const len: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) len[i][j] = ka[i] === kb[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1]);
  const parts: WordPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ka[i] === kb[j]) {
      parts.push({ k: 'same', w: b[j++] });
      i++;
    } else if (j < b.length && (i === a.length || len[i][j + 1] >= len[i + 1][j])) parts.push({ k: 'ins', w: b[j++] });
    else parts.push({ k: 'del', w: a[i++] });
  }
  return parts;
}

/** The share of the script's words the take read as written, in percent. */
export function matchedShare(parts: readonly WordPart[]): number {
  const same = parts.filter((p) => p.k === 'same').length;
  const total = same + parts.filter((p) => p.k === 'del').length;
  return total ? Math.round((same / total) * 100) : 0;
}
