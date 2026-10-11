import type { CardFinding } from './cardSelectors';
import { formatAudioTime } from '../../production/recordingCheckText';
import { Button } from '../../primitives/Button';
import { StatusBadge } from '../../primitives/StatusBadge';

/** One finding of the check: its kind, where, what, the decision it would start with, and Accept / Ignore (or the decision made). */
export function FindingRow({
  finding,
  resolved,
  busy,
  onAccept,
  onIgnore,
}: {
  finding: CardFinding;
  /** The resolution word the accepted note started with, when the host answered one. */
  resolved?: string;
  busy: boolean;
  onAccept: () => void;
  onIgnore: () => void;
}) {
  const at = finding.seconds === null ? '—' : formatAudioTime(finding.seconds);
  const what = `${finding.type} at ${at}`;
  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line)] py-2 text-sm"
      data-finding={finding.id}
      data-status={finding.status}
    >
      <StatusBadge tone="neutral" shape="tag" label={finding.type} />
      <span className="font-mono text-[var(--text-muted)] tabular-nums">{at}</span>
      <span className="min-w-0 flex-1">{finding.text}</span>
      <span className="text-[var(--text-muted)]">Suggested</span>
      <StatusBadge tone={finding.suggested === 'Needs pickup' ? 'danger' : 'warning'} label={resolved ?? finding.suggested} />
      {finding.status === 'todo' ? (
        <span className="flex gap-1.5">
          <Button variant="secondary" size="sm" disabled={busy} aria-label={`Accept ${what}`} onClick={onAccept}>
            Accept
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} aria-label={`Ignore ${what}`} onClick={onIgnore}>
            Ignore
          </Button>
        </span>
      ) : (
        <StatusBadge tone={finding.status === 'accepted' ? 'success' : 'neutral'} label={finding.status === 'accepted' ? 'Accepted' : 'Ignored'} />
      )}
    </li>
  );
}
