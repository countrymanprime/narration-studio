import { Link, useInRouterContext } from 'react-router-dom';
import type { CardFinding } from './cardSelectors';
import { formatAudioTime } from '../../production/recordingCheckText';
import { Button } from '../../primitives/Button';
import { statusTone } from '../../../kinds/statusTone';
import { KindChip } from '../../primitives/KindChip';
import { StatusBadge } from '../../primitives/StatusBadge';

/**
 * One finding of the check: its kind, where, what, the decision it would start with, and Accept / Ignore (or the decision made). A line said
 * twice links to Editing, where its second take is (`editing`); outside a router (a story, a unit test) no link is drawn.
 */
export function FindingRow({
  finding,
  resolved,
  busy,
  editing,
  onAccept,
  onIgnore,
}: {
  finding: CardFinding;
  /** Where the finding is fixed on Editing, for a line said twice. */
  editing?: string;
  /** The resolution word the accepted note started with, when the host answered one. */
  resolved?: string;
  busy: boolean;
  onAccept: () => void;
  onIgnore: () => void;
}) {
  const inRouter = useInRouterContext();
  const at = finding.seconds === null ? '—' : formatAudioTime(finding.seconds);
  const what = `${finding.type} at ${at}`;
  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] py-2 text-sm"
      data-finding={finding.id}
      data-status={finding.status}
    >
      <KindChip kind={finding.count} label={finding.type} />
      <span className="font-mono text-[var(--text-muted)] tabular-nums">{at}</span>
      <span className="min-w-0 flex-1">{finding.text}</span>
      {editing && inRouter ? (
        <Link className="font-semibold underline" to={editing} aria-label={`Open in Editing: ${what}`}>
          Open in Editing
        </Link>
      ) : null}
      <span className="text-[var(--text-muted)]">Suggested</span>
      <StatusBadge tone={statusTone(finding.suggested === 'Needs pickup' ? 'pickup' : 'edit')} label={resolved ?? finding.suggested} />
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
        <StatusBadge tone={statusTone(finding.status === 'accepted' ? 'accepted' : 'waive')} label={finding.status === 'accepted' ? 'Accepted' : 'Ignored'} />
      )}
    </li>
  );
}
