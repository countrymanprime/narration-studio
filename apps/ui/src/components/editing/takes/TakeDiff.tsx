import { kindMarkStyle } from '../../../kinds/markStyle';
import type { WordPart } from './diff';

/** A run of this many words left out is shortened to its first two and a count. */
const LONG_RUN = 5;

// Words the take left out are the script's missing words and words it added are extra words, drawn as those kinds are everywhere
// (kinds/kindMap.ts). `del` and `ins` keep their meaning for assistive technology; the browser's strike and underline are switched off
// so the registry's shape is the only mark.
const LEFT_OUT = { ...kindMarkStyle('missing'), textDecoration: 'none' };
const ADDED = { ...kindMarkStyle('extra'), textDecoration: 'none' };

/**
 * What the take said against the script: said as written, left out (the missing mark) and added (the extra mark). The two marks differ in
 * shape as well as colour, and the line reads aloud with "left out" and "added" around them.
 */
export function Diff({ parts }: { parts: readonly WordPart[] }) {
  const runs: Array<{ k: WordPart['k']; words: string[] }> = [];
  for (const p of parts) {
    const last = runs[runs.length - 1];
    if (last && last.k === p.k) last.words.push(p.w);
    else runs.push({ k: p.k, words: [p.w] });
  }
  return (
    <p className="m-0 text-[var(--text)]" data-diff>
      {runs.map((run, i) => {
        const full = run.words.join(' ');
        const gap = i > 0 ? ' ' : '';
        if (run.k === 'del') {
          const text = run.words.length > LONG_RUN ? `${run.words.slice(0, 2).join(' ')} … (${run.words.length} words)` : full;
          return (
            <span key={i}>
              {gap}
              <span className="sr-only">left out: </span>
              <del title={full} data-kind="missing" className="rounded-[0.15rem] px-[0.05em]" style={LEFT_OUT}>
                {text}
              </del>
            </span>
          );
        }
        if (run.k === 'ins')
          return (
            <span key={i}>
              {gap}
              <span className="sr-only">added: </span>
              <ins data-kind="extra" className="rounded-[0.15rem] px-[0.05em]" style={ADDED}>
                {full}
              </ins>
            </span>
          );
        return (
          <span key={i}>
            {gap}
            {full}
          </span>
        );
      })}
    </p>
  );
}
