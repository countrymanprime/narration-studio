import type { ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { StatusBadge } from '../../../primitives/StatusBadge';
import { TableCell, TableRow } from '../../../primitives/Table';
import { kindLabel, pct, summaryOf } from '../row/selectors';

/**
 * Suggestions with no entry in the Story Bible yet, as rows at the head of the entry table while the Needs verification chip is on: the
 * summary, what kind of suggestion it is, "not in the Story Bible yet" and a percent (or "No score"). Choosing one tells the page, which shows
 * its row (`SuggestionList`).
 */
export function LooseSuggestionRows({
  suggestions,
  selectedId,
  tabStopId,
  onSelect,
}: {
  suggestions: readonly ExtractionSuggestion[];
  selectedId: string | null;
  /** The row that holds the table's one tab stop, when it is one of these. */
  tabStopId?: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {suggestions.map((suggestion) => (
        <TableRow
          key={suggestion.id}
          data={{ 'data-loose': suggestion.id }}
          selected={selectedId === suggestion.id}
          tabStop={tabStopId === suggestion.id}
          onActivate={() => onSelect(suggestion.id)}
        >
          <TableCell>
            <span dir="auto" className="block truncate font-semibold">
              {summaryOf(suggestion.payload)}
            </span>
            <span className="block truncate text-[0.75rem] text-[var(--text-muted)]">not in the Story Bible yet</span>
          </TableCell>
          <TableCell>{kindLabel(suggestion.payload)}</TableCell>
          <TableCell>
            <StatusBadge tone="warning" look="outline" label={suggestion.confidence === null ? 'No score' : `${pct(suggestion.confidence)}%`} />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
