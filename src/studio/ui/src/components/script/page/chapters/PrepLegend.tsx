import { PREP_STATES } from '../../../../api/contracts/scriptPrep';
import { PREP_LABELS } from '../data/scriptCommands';
import { PrepDot } from './PrepDot';

/**
 * The chapter list's key to the dots: Not started, In progress, Prepped, in two columns (the mock stacks three rows), so it takes
 * one row less from the list, its dots on the list's dot column (alignment audit XSC-23).
 */
export function PrepLegend() {
  return (
    <ul
      aria-label="Prep key"
      className="m-0 grid list-none grid-cols-[auto_auto] justify-start gap-x-4 gap-y-1 border-t border-[var(--border)] bg-[var(--surface-2)] px-[1.125rem] py-2.5 text-[0.8125rem] text-[var(--text-muted)]"
    >
      {PREP_STATES.map((state) => (
        <li key={state} className="inline-flex items-center gap-1.5">
          <PrepDot state={state} decorative /> {PREP_LABELS[state]}
        </li>
      ))}
    </ul>
  );
}
