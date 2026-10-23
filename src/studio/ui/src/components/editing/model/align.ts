/**
 * Setting what was heard against the script: the longest common run of words, ignoring case and punctuation. Between two matches a word
 * the script has and a word that was heard take each other's place as a misread; what is left over on the script's side was not read, and
 * what is left over on the heard side was said and is not in the script.
 */

/** One word the recogniser heard, timed from the start of its stretch (seconds). */
export interface HeardWord {
  text: string;
  off0: number;
  off1: number;
  /** 0 to 1: how sure the recogniser was. */
  conf: number;
  /** Said, but not in the text the stretch was read from. */
  added?: boolean;
}
export interface Heard {
  words: HeardWord[];
  len: number;
}

export type AlignOp = { kind: 'w'; i: number; heard?: HeardWord; st: 'ok' | 'mis' | 'miss' } | { kind: 'x'; heard: HeardWord };

/** A word without case or punctuation: the thing two words are compared by. */
export const normKey = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}’']/gu, '')
    .replace(/'/g, '’');

/** How alike two words look, 0 to 1 (ignoring case and punctuation). */
function alike(a: string, b: string): number {
  const x = normKey(a);
  const y = normKey(b);
  if (!x.length && !y.length) return 1;
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => [i, ...new Array<number>(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  }
  return 1 - d[x.length][y.length] / Math.max(x.length, y.length);
}

/** Pair the script words of a stretch that differs with the words heard there, in order. Returns [script index, heard index] pairs. */
function pairUp(dels: string[], ins: string[]): Array<[number, number]> {
  if (dels.length === ins.length) return dels.map((_, k) => [k, k]);
  const n = dels.length;
  const m = ins.length;
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const sim = (i: number, j: number): number => alike(dels[i], ins[j]);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], sim(i, j) >= 0.34 ? sim(i, j) + best[i + 1][j + 1] : 0);
  }
  const out: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (sim(i, j) >= 0.34 && Math.abs(sim(i, j) + best[i + 1][j + 1] - best[i][j]) < 1e-9) {
      out.push([i, j]);
      i++;
      j++;
    } else if (best[i + 1][j] >= best[i][j + 1]) i++;
    else j++;
  }
  return out;
}

export function alignToScript(script: string[], heard: HeardWord[]): AlignOp[] {
  const ka = script.map(normKey);
  const kc = heard.map((h) => normKey(h.text));
  const L: number[][] = Array.from({ length: ka.length + 1 }, () => new Array<number>(kc.length + 1).fill(0));
  for (let i = ka.length - 1; i >= 0; i--) {
    for (let j = kc.length - 1; j >= 0; j--) L[i][j] = ka[i] === kc[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const ops: AlignOp[] = [];
  const flush = (dels: number[], ins: number[]): void => {
    /* Equal numbers pair in order; otherwise the pairing that looks most alike wins, and words with no look-alike are left over. */
    const pair = pairUp(
      dels.map((d) => script[d]),
      ins.map((j) => heard[j].text),
    );
    const taken = new Set(pair.map(([, b]) => b));
    dels.forEach((d, a) => {
      const hit = pair.find(([q]) => q === a);
      ops.push(hit ? { kind: 'w', i: d, heard: heard[ins[hit[1]]], st: 'mis' } : { kind: 'w', i: d, st: 'miss' });
    });
    ins.forEach((j, b) => {
      if (!taken.has(b)) ops.push({ kind: 'x', heard: heard[j] });
    });
  };
  let i = 0;
  let j = 0;
  let dels: number[] = [];
  let ins: number[] = [];
  while (i < ka.length || j < kc.length) {
    if (i < ka.length && j < kc.length && ka[i] === kc[j]) {
      flush(dels, ins);
      dels = [];
      ins = [];
      ops.push({ kind: 'w', i, heard: heard[j], st: 'ok' });
      i++;
      j++;
    } else if (j < kc.length && (i >= ka.length || L[i][j + 1] >= L[i + 1][j])) ins.push(j++);
    else dels.push(i++);
  }
  flush(dels, ins);
  return ops;
}
