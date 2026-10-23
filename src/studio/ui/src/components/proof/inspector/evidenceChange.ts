import type { Finding } from '../../../types';

/** One word of a heard text, and whether it is one the other text lacks (it left, or it arrived). */
export interface EvidenceWord {
  text: string;
  changed: boolean;
}

/** What the narrator was shown against what the latest check heard, when the evidence version moved. */
export interface EvidenceChange {
  was: EvidenceWord[];
  now: EvidenceWord[];
  wasKey: string;
  nowKey: string;
}

const versionOf = (finding: Finding) => finding.evidence_version ?? '';
const wordsOf = (finding: Finding) => (finding.manuscript?.recorded ?? '').split(/\s+/).filter(Boolean);

/** Word diff by longest common run: a word is unchanged when it is in the common sequence of both texts. */
function mark(a: string[], b: string[]): { a: EvidenceWord[]; b: EvidenceWord[] } {
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const outA: EvidenceWord[] = a.map((text) => ({ text, changed: true }));
  const outB: EvidenceWord[] = b.map((text) => ({ text, changed: true }));
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      outA[i].changed = false;
      outB[j].changed = false;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  return { a: outA, b: outB };
}

/**
 * The evidence the narrator was shown against the evidence now on the host, when they differ. The key is the finding's
 * `evidence_version`; "seen" is the finding the UI kept, not a wire field. Null while the key is equal or nothing was shown.
 */
export function evidenceChange(shown: Finding | undefined, current: Finding): EvidenceChange | null {
  if (!shown || versionOf(shown) === versionOf(current)) return null;
  const { a, b } = mark(wordsOf(shown), wordsOf(current));
  return { was: a, now: b, wasKey: versionOf(shown), nowKey: versionOf(current) };
}
