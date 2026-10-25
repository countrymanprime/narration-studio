import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { statusTone } from '../../../kinds/statusTone';
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
          {row && !row.noFile && (
            <IconButton action="openInReaper" label={`Open in ${gates.dawName}`} disabledReason={dawReason} onClick={() => actions.onOpenInDaw(row.id)} />
          )}
        </div>
      }
    >
      {gates.readProblem && (
        <p role="status" className="mb-2 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
          <span>{gates.readProblem}</span>
          <Button variant="ghost" size="sm" onClick={gates.checkAgain}>
            Check again
          </Button>
        </p>
      )}
      {!row ? (
        <p className="text-sm text-[var(--text-muted)]">Not mastered yet.</p>
      ) : row.waiting ? (
        <p className="text-sm text-[var(--text-muted)]">{row.waiting}.</p>
      ) : (
        // One grid for every row: the pill in a fixed column, so a label starts at the same x after "Pass" and "✕ Fail", and the row capped
        // so a value stays within reach of its label on a wide window (XMS-14). The mock's flex row spread them 900 px apart at 1920.
        <ul className="grid max-w-[48rem] grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_minmax(9.5rem,auto)]">
          {row.checks.map((check) => (
            <li key={check.ruleId} className="col-span-full grid grid-cols-subgrid items-center gap-y-1">
              <span>
                <StatusBadge tone={statusTone(check.passed ? 'pass' : 'fail')} label={check.passed ? 'Pass' : 'Fail'} icon={check.passed ? undefined : '✕'} />
              </span>
              <span>{check.label}</span>
              <span className="text-right font-['IBM_Plex_Mono',ui-monospace,monospace] whitespace-nowrap">{check.value}</span>
              <span className="text-[var(--text-muted)] max-sm:col-start-2 max-sm:col-end-[-1] sm:text-right">limit: {check.limit}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
