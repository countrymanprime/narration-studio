import type { Suggestion } from '../model/takes';
import { confidenceLabel } from '../model/takes';
import { StatusBadge } from '../../primitives/StatusBadge';
import { NOT_COMPARABLE } from './evidence';

/**
 * The suggested take with the confidence it can honestly claim, why, and the steps that would make it surer. The narrator decides: nothing
 * here keeps, selects or prepares a take. The take's own sub-line carries its evidence.
 */
export function Suggested({ suggestion, labelOf }: { suggestion: Suggestion; labelOf: (id: string) => string }) {
  const needed = suggestion.steps.filter((s) => s.needed);
  if (!suggestion.take && needed.length === 0) return null;
  const c = suggestion.confidence;
  return (
    <section
      aria-label="Suggested take"
      data-suggested
      className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--info-soft)] p-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <b>{suggestion.take ? `Suggested: ${labelOf(suggestion.take)}` : 'No suggestion yet'}</b>
        <StatusBadge
          tone={c === null ? 'neutral' : c >= 0.7 ? 'success' : 'warning'}
          label={c === null ? NOT_COMPARABLE : `${confidenceLabel(c)} · ${c.toFixed(2)}`}
        />
      </div>
      <span className="text-[var(--text-muted)]" data-why>
        {suggestion.reason}
      </span>
      {needed.length > 0 ? (
        <ul aria-label="Steps that would make it surer" className="m-0 flex list-none flex-col gap-0.5 p-0 text-[var(--text-muted)]">
          {needed.map((s) => (
            <li key={s.id} data-step={s.id}>
              <b className="text-[var(--text)]">{s.label}</b>: {s.why}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
