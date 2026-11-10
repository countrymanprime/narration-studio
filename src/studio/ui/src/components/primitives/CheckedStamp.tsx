import { useCallback, useState } from 'react';

// "Check again" that finds the same thing must still answer, or the narrator cannot tell a re-read from a dead button (#3276). The stamp is the answer:
// the clock time of the last completed read, to the second, so two presses in a row read differently. It draws nothing before the first read.
// `useCheckedAt` holds the time; call `markChecked` when a read has finished (not when it was asked for).
export function useCheckedAt(): readonly [number | null, () => void, number] {
  const [state, setState] = useState<{ at: number | null; reads: number }>({ at: null, reads: 0 });
  const markChecked = useCallback(() => setState((current) => ({ at: Date.now(), reads: current.reads + 1 })), []);
  return [state.at, markChecked, state.reads];
}

const TIME = { hour: 'numeric', minute: '2-digit', second: '2-digit' } as const;

// `reads` is the count `useCheckedAt` returns: from the second read on it is shown, so two presses in one second still read differently.
export function CheckedStamp({ at, reads = 1, className = '' }: { at: number | null; reads?: number; className?: string }) {
  if (at === null) return null;
  return (
    <span role="status" className={`text-sm whitespace-nowrap text-[var(--text-muted)] ${className}`}>
      {`Checked ${new Date(at).toLocaleTimeString([], TIME)}${reads > 1 ? ` (${reads})` : ''}`}
    </span>
  );
}
