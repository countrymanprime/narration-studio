import type { Finding } from '../../../types';

/** The two quotes of an Inspector, as markup: `<del>` marks a script word that was not heard, `<ins>` a heard word the script lacks. */
export interface EvidenceQuotes {
  script: string;
  heard: string;
}

const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wordsOf = (text: string | undefined) => (text ?? '').split(/\s+/).filter(Boolean);

/** Which words of each side are outside the longest common run of the two. */
function unmatched(script: string[], heard: string[]): { script: boolean[]; heard: boolean[] } {
  const lcs = Array.from({ length: script.length + 1 }, () => new Array<number>(heard.length + 1).fill(0));
  for (let i = script.length - 1; i >= 0; i--) {
    for (let j = heard.length - 1; j >= 0; j--) {
      lcs[i][j] = script[i] === heard[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = { script: script.map(() => true), heard: heard.map(() => true) };
  for (let i = 0, j = 0; i < script.length && j < heard.length;) {
    if (script[i] === heard[j]) {
      out.script[i] = false;
      out.heard[j] = false;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  return out;
}

const markup = (words: string[], marked: boolean[], tag: 'del' | 'ins') =>
  words.map((word, index) => (marked[index] ? `<${tag}>${escapeText(word)}</${tag}>` : escapeText(word))).join(' ');

/**
 * What the script says against what was heard, for a note that carries both. The marks are words in `<del>` and `<ins>` so a
 * difference is read from its shape and not from colour alone. Null when the note has no manuscript evidence: the section is not drawn.
 */
export function evidenceQuotes(finding: Finding): EvidenceQuotes | null {
  const script = wordsOf(finding.manuscript?.expected);
  const heard = wordsOf(finding.manuscript?.recorded);
  if (script.length === 0 && heard.length === 0) return null;
  const diff = unmatched(script, heard);
  return { script: markup(script, diff.script, 'del'), heard: markup(heard, diff.heard, 'ins') };
}

type MarkupTag = 'i' | 'b' | 'del' | 'ins';
export type MarkupNode = string | { tag: MarkupTag; children: MarkupNode[] };

const TAG = /<(\/?)(i|b|del|ins)>/g;
const decode = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Reads the Inspector's markup into a tree. Only `<i> <b> <del> <ins>` are tags; any other text, a stray closer included, is text, and
 * the three entities `evidenceQuotes` writes are decoded. Nothing here produces HTML.
 */
export function parseMarkup(source: string): MarkupNode[] {
  const root: MarkupNode[] = [];
  const open: Array<{ tag: MarkupTag; children: MarkupNode[] }> = [];
  const into = () => (open.length > 0 ? open[open.length - 1].children : root);
  const text = (raw: string) => {
    if (raw === '') return;
    const here = into();
    const last = here[here.length - 1];
    const decoded = decode(raw);
    if (typeof last === 'string') here[here.length - 1] = last + decoded;
    else here.push(decoded);
  };
  let from = 0;
  for (const match of source.matchAll(TAG)) {
    const tag = match[2] as MarkupTag;
    const closing = match[1] === '/';
    if (closing && !open.some((node) => node.tag === tag)) continue; // a stray closer stays in the text
    text(source.slice(from, match.index));
    from = match.index + match[0].length;
    if (!closing) {
      const node = { tag, children: [] as MarkupNode[] };
      into().push(node);
      open.push(node);
    } else {
      while (open.pop()?.tag !== tag);
    }
  }
  text(source.slice(from));
  return root;
}
