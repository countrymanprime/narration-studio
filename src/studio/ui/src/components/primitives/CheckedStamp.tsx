import { useCallback, useState } from 'react';

// "Check again" that finds the same thing must still answer, or the narrator cannot tell a re-read from a dead button (#3276). The stamp is the answer:
// the clock time of the last completed read, to the second, so two presses in a row read differently. It draws nothing before the first read.
// `useCheckedAt` holds the time; call `markChecked` when a read has finished (not when it was asked for).
export function useCheckedAt(): readonly [number | null, () => void] {
  const [at, setAt] = useState<number | null>(null);
  const markChecked = useCallback(() => setAt(Date.now()), []);
  return [at, markChecked];
}

const TIME = { hour: 'numeric', minute: '2-digit', second: '2-digit' } as const;

export function CheckedStamp({ at, className = '' }: { at: number | null; className?: string }) {
  if (at === null) return null;
  return (
    <span role="status" className={`text-sm whitespace-nowrap text-[var(--text-muted)] ${className}`}>
      {`Checked ${new Date(at).toLocaleTimeString([], TIME)}`}
    </span>
  );
}
