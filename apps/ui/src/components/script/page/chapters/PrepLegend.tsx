import { PREP_STATES } from '../../../../api/contracts/scriptPrep';
import { PREP_LABELS } from '../data/scriptCommands';
import { PrepDot } from './PrepDot';

/** The chapter list's key to the dots: Not started, In progress, Prepped. */
export function PrepLegend() {
  return (
    <ul
      aria-label="Prep key"
      className="m-0 flex list-none flex-col items-start gap-1 border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-[0.8125rem] text-[var(--text-muted)]"
    >
      {PREP_STATES.map((state) => (
        <li key={state} className="inline-flex items-center gap-1.5">
          <PrepDot state={state} decorative /> {PREP_LABELS[state]}
        </li>
      ))}
    </ul>
  );
}
