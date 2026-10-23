import { useEffect, useState } from 'react';
import { Button } from '../primitives/Button';

/** Seconds since `at`, re-rendered every second while mounted; null when there is no time. */
export function useSecondsSince(at: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return at == null ? null : Math.max(0, Math.round((now - at) / 1000));
}

/** What the notice is waiting for and when it last looked, with the Check again that forces a fresh read. */
export function CheckLine({
  waiting,
  unknown,
  checkedAt,
  readFailed,
  onCheckAgain,
}: {
  waiting: string;
  unknown: string;
  checkedAt?: number | null;
  readFailed?: boolean;
  onCheckAgain?: () => void;
}) {
  const seconds = useSecondsSince(checkedAt);
  const last = seconds === null ? 'Not checked yet' : `Last checked ${seconds} s ago`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[var(--text-muted)]">
      {/* Only the sentence that changes with the state is announced; the seconds tick every second and are not. */}
      <span role="status">{readFailed ? `Can't tell whether ${unknown}.` : `${waiting}.`}</span>
      <span>{last}.</span>
      {onCheckAgain && (
        <Button variant="secondary" size="sm" onClick={onCheckAgain}>
          Check again
        </Button>
      )}
    </div>
  );
}
