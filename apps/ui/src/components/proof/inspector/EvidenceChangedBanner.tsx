import type { ReactNode } from 'react';
import { Button } from '../../primitives/Button';
import { SectionLabel } from '../../primitives/SectionLabel';
import type { EvidenceChange, EvidenceWord } from './evidenceChange';

/**
 * Words that left are struck (`del`) in "Before" and words that arrived are underlined (`ins`) in "Now", so a change is read from the
 * shape of the text and not from its colour alone.
 */
function Words({ words, mark }: { words: EvidenceWord[]; mark: 'del' | 'ins' }) {
  if (words.length === 0) return <span style={{ color: 'var(--text-muted)' }}>Nothing heard</span>;
  const Tag = mark;
  return words.map((word, index): ReactNode => {
    const text = word.changed ? <Tag className="font-semibold">{word.text}</Tag> : word.text;
    return index === 0 ? text : [' ', text];
  });
}

/**
 * Shown over a note's decision when a re-check changed the evidence under the narrator (the Studio Next Inspector's `#evchanged`): what they
 * were shown, what the check hears now, and the one way forward, taking the new evidence as the one to decide on.
 */
export function EvidenceChangedBanner({ change, onUseNewEvidence }: { change: EvidenceChange; onUseNewEvidence: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--accent-soft)] p-3 text-sm">
      <b>The evidence changed</b>
      <div className="flex flex-col gap-1">
        <SectionLabel>Before</SectionLabel>
        <p data-was className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
          <Words words={change.was} mark="del" />
        </p>
        <SectionLabel>Now</SectionLabel>
        <p data-now className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
          <Words words={change.now} mark="ins" />
        </p>
      </div>
      <div>
        <Button variant="secondary" size="sm" onClick={onUseNewEvidence}>
          Use the new evidence
        </Button>
      </div>
    </div>
  );
}
