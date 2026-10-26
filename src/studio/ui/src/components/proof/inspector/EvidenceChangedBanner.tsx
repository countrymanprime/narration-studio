import type { ReactNode } from 'react';
import { Button } from '../../primitives/Button';
import { SectionLabel } from '../../primitives/SectionLabel';
import type { EvidenceChange, EvidenceWord } from './evidenceChange';
import { ARRIVE_CLASSES } from '../../primitives/changeHighlight';
import { DIFF_CLASS, quoteClass } from './quoteStyle';

/**
 * Words that left are struck (`del`) in "Before" and words that arrived are tinted (`ins`) in "Now", so a change is read from the
 * shape and the tint of the text and not from its colour alone.
 */
function Words({ words, mark }: { words: EvidenceWord[]; mark: 'del' | 'ins' }) {
  if (words.length === 0) return <span style={{ color: 'var(--text-muted)' }}>Nothing heard</span>;
  const Tag = mark;
  return words.map((word, index): ReactNode => {
    const text = word.changed ? <Tag className={DIFF_CLASS[mark]}>{word.text}</Tag> : word.text;
    return index === 0 ? text : [' ', text];
  });
}

/** Whether the re-check heard other words; when it did not (only the timing or the confidence moved), Before and Now would read the same. */
const wordsMoved = (change: EvidenceChange) => change.was.some((word) => word.changed) || change.now.some((word) => word.changed);

/**
 * Shown over a note's decision when a re-check changed the evidence under the narrator (the Studio Next Inspector's `#evchanged`): what they
 * were shown, what the check hears now, and the one way forward, taking the new evidence as the one to decide on.
 */
export function EvidenceChangedBanner({ change, onUseNewEvidence }: { change: EvidenceChange; onUseNewEvidence: () => void }) {
  return (
    <div
      role="alert"
      className={`flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--warn-soft)] p-3 text-sm ${ARRIVE_CLASSES}`}
    >
      <b>The evidence changed</b>
      {wordsMoved(change) ? (
        <div className="flex flex-col gap-1">
          <SectionLabel>Before</SectionLabel>
          <p data-was className={quoteClass('surface')}>
            <Words words={change.was} mark="del" />
          </p>
          <SectionLabel>Now</SectionLabel>
          <p data-now className={quoteClass('surface')}>
            <Words words={change.now} mark="ins" />
          </p>
        </div>
      ) : (
        // The same words in both would be two identical boxes (alignment audit R3PF-9): say what did not change instead.
        <p data-now>The check heard the same words again; their timing or confidence changed.</p>
      )}
      <p>The decision buttons wait until you take the new evidence.</p>
      <div>
        <Button variant="secondary" size="sm" onClick={onUseNewEvidence}>
          Use the new evidence
        </Button>
      </div>
    </div>
  );
}
