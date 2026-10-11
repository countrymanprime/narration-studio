import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { FileActions } from './FileActions';
import type { FileRow } from './rows';
import { useDawGates, type Gate } from './useDawGates';

const off = (gate: Gate): string | undefined => (gate.ok ? undefined : gate.reason);

/**
 * The detail under the files table (the mock's "<file> · Why it fails / Checks"): every check the host answered for the file,
 * each with a Pass or Fail pill, the measured value and the profile's limit. A rule the host did not measure has no row. A file
 * not mastered says so, and so does a chapter with no file (`row` undefined, `chapterLabel` its name). The two actions follow
 * the DAW's capabilities: off with the capability's own sentence, and named for the DAW the report names.
 */
export function FileChecks({ row, chapterLabel, actions }: { row: FileRow | undefined; chapterLabel?: string; actions: FileActions }) {
  const gates = useDawGates();
  const label = row?.name ?? chapterLabel ?? '';
  const failing = row?.checks.some((check) => !check.passed) ?? false;
  const heading = !row || row.waiting ? 'Not mastered' : failing ? 'Why it fails' : 'Checks';
  const dawReason = off(gates.open);
  return (
    <Panel
      title={`${label} · ${heading}`}
      actions={
        <div className="flex items-center gap-2">
          {row && !row.waiting && (
            <IconButton action="play" label="Play the quietest 5 s" disabledReason={off(gates.play)} onClick={() => actions.onPlayQuietest(row.id)} />
          )}
          {row && (
            <IconButton action="openInReaper" label={`Open in ${gates.dawName}`} disabledReason={dawReason} onClick={() => actions.onOpenInDaw(row.id)} />
          )}
          <IconButton action="retry" label="Check the files again" disabledReason={off(gates.recheck)} onClick={actions.onRecheck} />
        </div>
      }
    >
      {!row ? (
        <p className="text-sm text-[var(--text-muted)]">Not mastered yet.</p>
      ) : row.waiting ? (
        <p className="text-sm text-[var(--text-muted)]">{row.waiting}.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {row.checks.map((check) => (
            <li key={check.ruleId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge tone={check.passed ? 'success' : 'danger'} label={check.passed ? 'Pass' : 'Fail'} icon={check.passed ? undefined : '✕'} />
              <span className="flex-1">{check.label}</span>
              <span className="font-['IBM_Plex_Mono',ui-monospace,monospace]">{check.value}</span>
              <span className="min-w-[9.5rem] text-right text-[var(--text-muted)]">limit: {check.limit}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
