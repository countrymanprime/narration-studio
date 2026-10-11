import { useId } from 'react';
import { defaultFindingNoteType, FINDING_NOTE_TYPES } from '../../../api/contracts/findings';
import type { Finding, FindingNoteType } from '../../../types';
import { Select } from '../../primitives/Select';

const OPTIONS = FINDING_NOTE_TYPES.map((type) => ({ value: type, label: type }));

/** The type a note shows: the narrator's choice, else the analyzer's mapped word (ADR 0844). */
function shownNoteType(finding: Pick<Finding, 'category' | 'evidence' | 'review'>): FindingNoteType {
  return finding.review.type ?? defaultFindingNoteType(finding);
}

/**
 * The type of finding the narrator can change (the Studio Next Inspector's `#ptype`): a select over the ten words, showing the
 * chosen one or the analyzer's own. The caller's handler records the choice, so the stale-evidence refusal applies. While the
 * evidence-changed banner is up it is disabled and says why.
 */
export function TypeSelect({
  finding,
  onChange,
  evidenceChanged = false,
}: {
  finding: Pick<Finding, 'category' | 'evidence' | 'review'>;
  onChange: (type: FindingNoteType) => void;
  evidenceChanged?: boolean;
}) {
  const reasonId = useId();
  return (
    <>
      <Select
        label="Type of finding"
        value={shownNoteType(finding)}
        options={OPTIONS}
        disabled={evidenceChanged}
        aria-describedby={evidenceChanged ? reasonId : undefined}
        onChange={(value) => onChange(value as FindingNoteType)}
      />
      {evidenceChanged ? (
        <span id={reasonId} className="sr-only">
          The evidence changed; use the new evidence before changing the type.
        </span>
      ) : null}
    </>
  );
}
