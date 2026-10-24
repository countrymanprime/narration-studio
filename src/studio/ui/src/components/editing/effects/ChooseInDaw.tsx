import { useEffect, useState } from 'react';
import type { ChooseState } from '../range/fx/useChooseInDaw';
import { Button } from '../../primitives/Button';

/** How long without an answer before the panel says it cannot tell what is chosen, in milliseconds. */
export const CHOOSE_QUIET_MS = 6000;

/** Whole seconds since `at`, as the panel words them. */
const secondsAgo = (now: number, at: number): number => Math.max(0, Math.round((now - at) / 1000));

/**
 * The panel Choose in the DAW shows while the DAW's own FX window is open for the words (#2251): what the DAW says is chosen, when it last
 * said so, and Keep it, Cancel and Check again. It says when the DAW has gone quiet rather than showing an old answer as current.
 */
export function ChooseInDaw({
  state,
  dawName,
  onKeep,
  onCancel,
  onCheck,
}: {
  state: Extract<ChooseState, { phase: 'choosing' }>;
  dawName: string;
  onKeep: () => void;
  onCancel: () => void;
  onCheck: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const { choice, heardAt, problem, busy, text } = state;
  const quiet = heardAt === null ? false : now - heardAt > CHOOSE_QUIET_MS;
  const chosen = choice?.fx ?? [];
  return (
    <div
      role="group"
      aria-label={`Choosing in ${dawName}`}
      data-choose-in-daw
      className="flex flex-col gap-2 rounded-[var(--radius-button)] border border-[var(--border)] p-2 text-[length:var(--font-size-sm)]"
    >
      <p className="m-0">
        Choose an effect for <b className="[overflow-wrap:anywhere]">“{text}”</b> in {dawName}’s FX window. When you close that window it is added to these
        words; Keep it adds it now.
      </p>
      <p className="m-0" role="status" aria-live="polite">
        {heardAt === null
          ? `Asking ${dawName} what is chosen…`
          : quiet
            ? `Can't tell what is chosen: ${dawName} last answered ${secondsAgo(now, heardAt)} s ago.`
            : chosen.length
              ? `${dawName} has ${choice?.label}${choice?.chainOpen ? ', its window still open' : ''}.`
              : `Nothing chosen in ${dawName} yet.`}
      </p>
      {chosen.length > 1 ? (
        <ul className="m-0 list-disc pl-5" aria-label={`Chosen in ${dawName}`}>
          {chosen.map((fx, i) => (
            <li key={`${i}-${fx.name}`} className="[overflow-wrap:anywhere]">
              {fx.name}
              {fx.enabled ? '' : ' (bypassed)'}
            </li>
          ))}
        </ul>
      ) : null}
      {problem ? (
        <p role="alert" className="m-0 [overflow-wrap:anywhere] text-[var(--danger-text)]">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !chosen.length} onClick={onKeep}>
          Keep it
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onCheck}>
          Check again
        </Button>
      </div>
    </div>
  );
}
