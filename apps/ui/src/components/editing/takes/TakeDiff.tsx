import type { WordPart } from './diff';

/** A run of this many words left out is shortened to its first two and a count. */
const LONG_RUN = 5;

/**
 * What the take said against the script: said as written, left out (struck through) and added (underlined). The two marks differ in shape
 * as well as colour, and the line reads aloud with "left out" and "added" around them.
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
              <del title={full} className="bg-[var(--danger-soft)] text-[var(--danger-text)] line-through">
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
              <ins className="bg-[var(--ok-soft)] text-[var(--ok-text)] underline decoration-2">{full}</ins>
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
