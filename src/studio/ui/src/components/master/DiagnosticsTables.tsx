import type { DiagnosticsFileResult, DiagnosticsSourceKind, DiagnosticsSummary, Finding } from '../../types';
import { severityLabel } from '../proof/findingFormat';
import { StatusBadge, type StatusTone } from '../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { formatLength } from './deliveryFormat';
import { cleanupClassLabel, cleanupLevelText, findingKindLabel, measuredText, sourceKindLabel, thresholdText, timeRangeText } from './diagnosticsFormat';

const MUTED = { color: 'var(--text-muted)' };
const SUMMARY_COLUMNS = 5;
const NOWRAP = 'whitespace-nowrap';
const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";

// Fixed column widths (`Table columns`) and a floor on each table: a long cell wraps in its own column, the headings stay on one line
// and at the same x in every state, and under the floor the table scrolls in its box (XMS-11, XMS-23). The name or text column takes the rest.
// The floors keep the name column at least 9rem and a finding's or a candidate's text at least 12rem.
const SUMMARY_WIDTHS = ['auto', '5rem', '6.5rem', '6.5rem', '7rem', '12rem'];
const SUMMARY_FLOOR = 'min-w-[46rem]';
const FINDING_WIDTHS = ['9.5rem', 'auto', '8.5rem', '9rem', '9rem'];
const CLEANUP_WIDTHS = ['9.5rem', '7rem', 'auto', '9rem', '10rem'];
const TEXT_FLOOR = 'min-w-[48rem]';

/** A finding's severity as a pill at a fixed place in its cell, not a bare word after the title (R3MS-15). */
const SEVERITY_TONE: Record<Finding['severity'], StatusTone> = { info: 'neutral', warning: 'warning', error: 'danger' };

/** The source kind the finding records, or the check's when a finding does not say. */
const findingSourceKind = (finding: Finding, fallback: DiagnosticsSourceKind): DiagnosticsSourceKind => {
  const recorded = finding.evidence?.source_kind;
  return recorded === 'raw_recording' || recorded === 'processed_render' ? recorded : fallback;
};

/**
 * Why a file has no summary yet, or will not have one: `long` on its own, `short` when other rows say the same, since the line over the
 * table already says it once for all of them (R3MS-3). A check that broke on another file ends with the rest cancelled too, so a
 * cancelled file says only that the check stopped before it.
 */
function notChecked(file: DiagnosticsFileResult): { long: string; short: string } {
  switch (file.status) {
    case 'pending':
      return { long: 'Waiting to be checked.', short: 'Waiting.' };
    case 'checking':
      return { long: 'Being checked now.', short: 'Being checked now.' };
    case 'cancelled':
      return { long: 'Not checked: the check stopped before this file.', short: 'Not checked.' };
    default: {
      const text = `Could not be checked: ${file.error ?? 'the file could not be read.'}`;
      return { long: text, short: text };
    }
  }
}

function pacingText(summary: DiagnosticsSummary): string {
  if (summary.pacing.status === 'measured' && summary.words_per_minute !== null) return `${Math.round(summary.words_per_minute)} words a minute`;
  return `Not available: ${summary.pacing.reason ?? 'no transcript timing'}`;
}

/**
 * One row per file: what the analyzers found in it as counts (every clip region, even past the ones listed), how much of it is
 * silence, and the pacing, which needs transcript timing and says so without it. A file it could not read shows why instead.
 */
export function CheckedFilesTable({ files }: { files: readonly DiagnosticsFileResult[] }) {
  const said = new Map<string, number>();
  for (const file of files) if (file.status !== 'checked') said.set(notChecked(file).long, (said.get(notChecked(file).long) ?? 0) + 1);
  return (
    <Table label="Checked files" columns={SUMMARY_WIDTHS} className={SUMMARY_FLOOR}>
      <TableHead>
        <TableRow>
          <TableHeader className={NOWRAP}>File</TableHeader>
          <TableHeader className={NOWRAP}>Length</TableHeader>
          <TableHeader className={NOWRAP}>Clip regions</TableHeader>
          <TableHeader className={NOWRAP}>Level shifts</TableHeader>
          <TableHeader className={NOWRAP}>Silence</TableHeader>
          {/* Left-aligned text after right-aligned figures: a wider gap so "212 (3:07)" and the pacing do not read as one cell (R3MS-16). */}
          <TableHeader className={`${NOWRAP} pl-8`}>Pacing</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {files.map((file) => {
          const summary = file.status === 'checked' ? file.summary : null;
          const reason = notChecked(file);
          return (
            <TableRow key={file.path}>
              <TableCell className="font-medium break-words">{file.name}</TableCell>
              {summary ? (
                <>
                  <TableCell numeric>{formatLength(summary.duration_seconds)}</TableCell>
                  <TableCell numeric>{summary.clip_regions}</TableCell>
                  <TableCell numeric>{summary.level_shifts}</TableCell>
                  <TableCell numeric>{`${summary.silences} (${formatLength(summary.silence_seconds)})`}</TableCell>
                  <TableCell className="pl-8 text-[0.8rem]" style={summary.pacing.status === 'measured' ? undefined : MUTED}>
                    {pacingText(summary)}
                  </TableCell>
                </>
              ) : (
                <TableCell colSpan={SUMMARY_COLUMNS} style={file.status === 'failed' ? { color: 'var(--danger-text)' } : MUTED}>
                  {(said.get(reason.long) ?? 0) > 1 ? reason.short : reason.long}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Every finding in file order, then time order: when in the file, what it is and how the analyzer rated it (in words, and why, from
 * its own reason), what was measured, the threshold that raised it, and the source it was measured in. No grade, and no action: the
 * table is read-only.
 */
export function FindingsTable({ files, sourceKind }: { files: readonly DiagnosticsFileResult[]; sourceKind: DiagnosticsSourceKind }) {
  const rows = files.flatMap((file) =>
    [...file.findings].sort((a, b) => (a.time_range?.start ?? 0) - (b.time_range?.start ?? 0)).map((finding) => ({ file, finding })),
  );
  return (
    // Every cell starts at the top of its row, so a finding's time, title, value and file share their first line (XMS-12).
    <Table label="Findings" columns={FINDING_WIDTHS} className={TEXT_FLOOR}>
      <TableHead>
        <TableRow>
          <TableHeader className={NOWRAP}>Time</TableHeader>
          <TableHeader className={NOWRAP}>Finding</TableHeader>
          <TableHeader className={NOWRAP}>Measured</TableHeader>
          <TableHeader className={NOWRAP}>Threshold</TableHeader>
          <TableHeader className={NOWRAP}>Source</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map(({ file, finding }) => (
          <TableRow key={`${file.path}:${finding.id}`}>
            <TableCell numeric align="left" valign="top">
              {timeRangeText(finding)}
            </TableCell>
            <TableCell valign="top">
              <span className="flex items-start justify-between gap-2">
                <span className="font-medium">{findingKindLabel(finding)}</span>
                <StatusBadge tone={SEVERITY_TONE[finding.severity] ?? 'neutral'} label={severityLabel(finding.severity)} />
              </span>
              <span className="block text-[0.75rem]" style={MUTED}>
                {finding.confidence_reason}
              </span>
            </TableCell>
            <TableCell valign="top" className={`${MONO} text-[0.8rem]`}>
              {measuredText(finding)}
            </TableCell>
            <TableCell valign="top" className="text-[0.8rem]">
              {thresholdText(finding)}
            </TableCell>
            <TableCell valign="top" className="break-words">
              <span className="font-medium">{file.name}</span>
              <span className="block text-[0.75rem]" style={MUTED}>{`${sourceKindLabel(findingSourceKind(finding, sourceKind))}, whole file`}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Every silence cleanup candidate in file order, then time order (src/studio/desktop/internal/measure/cleanup.go): its class, why the analyzer
 * called it that and how confident it is, its level, and the file it is in. Read-only and informational: nothing here
 * applies a cut. A candidate's own suggested split-and-trim range is not shown, since it never runs from this list.
 */
export function CleanupFindingsTable({ files }: { files: readonly DiagnosticsFileResult[] }) {
  const rows = files.flatMap((file) =>
    [...file.cleanupFindings].sort((a, b) => (a.time_range?.start ?? 0) - (b.time_range?.start ?? 0)).map((finding) => ({ file, finding })),
  );
  return (
    <Table label="Silence cleanup candidates" columns={CLEANUP_WIDTHS} className={TEXT_FLOOR}>
      <TableHead>
        <TableRow>
          <TableHeader className={NOWRAP}>Time</TableHeader>
          <TableHeader className={NOWRAP}>Class</TableHeader>
          <TableHeader className={NOWRAP}>Why</TableHeader>
          <TableHeader className={NOWRAP}>Level</TableHeader>
          <TableHeader className={NOWRAP}>File</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map(({ file, finding }) => (
          <TableRow key={`${file.path}:${finding.id}`}>
            <TableCell numeric align="left" valign="top">
              {timeRangeText(finding)}
            </TableCell>
            <TableCell valign="top" className="font-medium">
              {cleanupClassLabel(finding)}
            </TableCell>
            <TableCell valign="top" className="text-[0.8rem]">
              {finding.confidence_reason}
            </TableCell>
            <TableCell valign="top" className={`${MONO} text-[0.8125rem]`}>
              {cleanupLevelText(finding)}
            </TableCell>
            <TableCell valign="top" className="break-words">
              {file.name}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
