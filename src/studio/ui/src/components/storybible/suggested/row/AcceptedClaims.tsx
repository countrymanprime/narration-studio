import type { ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { ConfidenceChip } from './ConfidenceChip';
import { Quotes, type EvidenceLinks } from './Quotes';
import { CLAIM_LABEL, claimsOf, propertiesOf, type ConfidenceContext } from './selectors';

/** What was accepted about an entry, under the labels Says, Does, Knows and Details, each with the quote it rests on. Read-only: nothing here changes a suggestion. */
export function AcceptedClaims({
  entryId,
  suggestions,
  context,
  onGoToEvidence,
  lineLabel,
}: EvidenceLinks & { entryId: string; suggestions: readonly ExtractionSuggestion[]; context?: ConfidenceContext }) {
  const groups = [
    ...(['talk', 'act', 'know'] as const).map((claim) => ({ key: claim, label: CLAIM_LABEL[claim], list: claimsOf(suggestions, entryId, claim) })),
    { key: 'prop', label: 'Details', list: propertiesOf(suggestions, entryId) },
  ].filter((group) => group.list.length);
  if (!groups.length) return null;
  return (
    <div className="flex flex-col gap-3" data-claims>
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5" data-claim-group={group.key}>
          <SectionLabel>{group.label}</SectionLabel>
          {group.list.map((suggestion) => (
            <div key={suggestion.id} className="flex flex-col gap-1" data-claim={suggestion.id}>
              <span className="text-sm">
                {suggestion.payload.kind === 'property'
                  ? `${suggestion.payload.key}: ${suggestion.payload.value}`
                  : suggestion.payload.kind === 'claim'
                    ? suggestion.payload.text
                    : ''}
                {suggestion.status === 'accepted-auto' ? (
                  <>
                    {' '}
                    <ConfidenceChip suggestion={suggestion} context={context} />
                  </>
                ) : null}
              </span>
              <Quotes suggestion={suggestion} onGoToEvidence={onGoToEvidence} lineLabel={lineLabel} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
