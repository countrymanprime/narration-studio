import type { ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { StatusBadge } from '../../../primitives/StatusBadge';
import { TableCell, TableRow } from '../../../primitives/Table';
import { kindLabel, pct, summaryOf } from '../row/selectors';

/**
 * Suggestions with no entry in the Story Bible yet, as rows at the head of the entry table while the Needs verification chip is on: the
 * summary (its hint and its spoken name add "not in the Story Bible yet"), and what kind of suggestion it is with a percent (or "No score"). Choosing one tells the page, which shows
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
          {/* One line like an entry row (the table counts every row as one 39 px row), the full summary as the hint; the score sits in the
              Kind cell, which takes the Hear button's 26 px column too, where a pill overflowed (SBX-17, R3SB2-7). */}
          <TableCell>
            {/* `relative` makes the span the screen-reader text's containing block, so that absolutely placed text is clipped with the
                truncated summary instead of standing at the end of the full one, past the cell, and scrolling the page sideways. */}
            <span dir="auto" className="relative block truncate font-semibold" title={`${summaryOf(suggestion.payload)} (not in the Story Bible yet)`}>
              {summaryOf(suggestion.payload)}
              <span className="sr-only"> (not in the Story Bible yet)</span>
            </span>
          </TableCell>
          <TableCell colSpan={2}>
            <span className="flex min-w-0 items-center gap-1.5">
              {/* As an entry row's kind, which keeps only its dot in a narrow table: the score stays, the word is still read. */}
              <span className="min-w-0 truncate @max-[20rem]:sr-only">{kindLabel(suggestion.payload)}</span>
              <span className="flex-none whitespace-nowrap">
                <StatusBadge tone="warning" look="outline" label={suggestion.confidence === null ? 'No score' : `${pct(suggestion.confidence)}%`} />
              </span>
            </span>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
