import type { ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { StatusBadge } from '../../../primitives/StatusBadge';
import { kindLabel, pct, summaryOf } from '../row/selectors';

/**
 * Suggestions with no entry in the Story Bible yet, listed above the entries while the Needs verification chip is on: the summary, a
 * percent (or "No score") and "{kind} · not in the Story Bible yet". Choosing one tells the page, which shows its row (`SuggestionList`).
 */
export function LooseSuggestionRows({
  suggestions,
  selectedId,
  onSelect,
}: {
  suggestions: readonly ExtractionSuggestion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {suggestions.map((suggestion) => (
        <li key={suggestion.id}>
          {/* native-control-ok: a whole list row is the button, a two-line target Button's padded uppercase chrome cannot draw (the mock's chlist row). */}
          <button
            type="button"
            data-loose={suggestion.id}
            aria-current={selectedId === suggestion.id || undefined}
            onClick={() => onSelect(suggestion.id)}
            className="flex w-full min-w-0 flex-col gap-0.5 px-4 py-2 text-left hover:bg-[var(--surface-2)] aria-[current]:bg-[var(--accent-soft)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <b className="min-w-0 truncate">{summaryOf(suggestion.payload)}</b>
              <span className="ml-auto flex-none">
                <StatusBadge tone="warning" look="outline" label={suggestion.confidence === null ? 'No score' : `${pct(suggestion.confidence)}%`} />
              </span>
            </span>
            <span className="text-[var(--text-muted)]">{kindLabel(suggestion.payload)} · not in the Story Bible yet</span>
          </button>
        </li>
      ))}
    </>
  );
}
