import { useMemo } from 'react';
import { DAW_CAPABILITIES, type DawCapabilities, type DawCapabilityLevel, type DawCapabilitySupport } from '../../api/contracts/daw';
import { CAPABILITY_GUIDE } from '../../daw/capabilityGuide';
import { CAPABILITY_MATRIX, MATRIX_TOOLS, type MatrixCell } from '../../daw/capabilityMatrix';
import { IconButton } from '../primitives/IconButton';
import { StatusBadge } from '../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { keepFocusOnRemoval } from '../layout/keepFocusOnRemoval';

// What takes the free width, one narrow column for each tool, and Now, which holds a badge and, when the tool cannot do it, the tool's own sentence.
const COLUMNS = ['auto', '4.75rem', '4.75rem', '4.75rem', '4.75rem', '13rem'] as const;

const LABELS = new Map<string, string>(DAW_CAPABILITIES.map(({ key, label }) => [key, label]));
const LEVEL_WORD: Record<DawCapabilityLevel, string> = {
  supported: 'Available',
  experimental: 'Available',
  not_yet_available: 'Not yet available',
  unsupported: 'Unsupported',
};
const CELL: Record<MatrixCell, { label: string; tone: 'success' | 'neutral' | 'warning'; icon: string }> = {
  yes: { label: 'Yes', tone: 'success', icon: '✓' },
  soon: { label: 'Not yet', tone: 'warning', icon: '…' },
  no: { label: 'No', tone: 'neutral', icon: '✕' },
};

/** The catalogue's order, then keys only the host knows (a newer host's), under their own key. */
function keysOf(report: DawCapabilities | undefined): string[] {
  const reported = report ? Object.keys(report.capabilities) : [];
  return [...DAW_CAPABILITIES.map(({ key }) => String(key)), ...reported.filter((key) => !LABELS.has(key))];
}

/** The tool's name for the table's title: the DAW's own, or "the recording tool" when the launch names none. */
export const toolName = (report: DawCapabilities | undefined): string =>
  !report || report.daw === 'none' ? 'the recording tool' : report.daw === 'Built-in' ? 'the built-in recorder' : report.daw;

/** What the capability is now: available, or the host's own sentence for why not (the page never words a refusal). */
function Now({ support }: { support: DawCapabilitySupport | undefined }) {
  if (!support) return <span className="text-[var(--text-muted)]">Not reported</span>;
  if (support.available) return <StatusBadge tone="success" label="Available" />;
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusBadge tone="neutral" label="Unavailable" />
      <span className="text-[0.8125rem] text-[var(--text-muted)]">{support.message ?? LEVEL_WORD[support.level] ?? LEVEL_WORD.unsupported}</span>
    </span>
  );
}

/** How many of the capabilities the host reports are available now, for the one-line Settings row. */
export function availableCount(report: DawCapabilities | undefined): { available: number; total: number } {
  const all = Object.values(report?.capabilities ?? {});
  return { available: all.filter((support) => support.available).length, total: all.length };
}

/**
 * What the recording tools can do, one row for each thing the app can ask of them: what it is for and where the app uses it, whether each of
 * the four tools does it, and what the linked tool reports now. Props only, so the story and the tests show every state. Nothing here
 * switches a capability on or off. The levels are the adapters' own declarations (`capabilityMatrix.ts`); Now is the host's.
 */
export function CapabilityReference({ report, loadError, onRetry }: { report: DawCapabilities | undefined; loadError: string; onRetry: () => void }) {
  const keys = useMemo(() => keysOf(report), [report]);
  return (
    <div className="flex w-full flex-col gap-3">
      {loadError && !report && (
        <div className="flex flex-wrap items-center gap-3 text-[0.8125rem] text-[var(--danger-text)]" role="alert">
          <span>The recording tool’s capabilities could not be read: {loadError}.</span>
          <IconButton action="retry" ref={keepFocusOnRemoval} size="sm" onClick={onRetry} />
        </div>
      )}
      <Table label="What the recording tools can do" columns={COLUMNS}>
        <TableHead>
          <TableRow>
            <TableHeader>What</TableHeader>
            {MATRIX_TOOLS.map((tool) => (
              <TableHeader key={tool}>{tool === 'Built-in recorder' ? 'Built-in' : tool}</TableHeader>
            ))}
            <TableHeader>{`Now in ${toolName(report)}`}</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {keys.map((key) => {
            const known = key in CAPABILITY_GUIDE;
            const guide = known ? CAPABILITY_GUIDE[key as keyof typeof CAPABILITY_GUIDE] : undefined;
            const levels = known ? CAPABILITY_MATRIX[key as keyof typeof CAPABILITY_MATRIX] : undefined;
            return (
              <TableRow key={key} data={{ 'data-capability': key }}>
                <TableCell>
                  <span className="block font-medium">{LABELS.get(key) ?? key}</span>
                  {guide && <span className="block text-[0.8125rem] text-[var(--text-muted)]">{guide.does}</span>}
                  {guide && (
                    <span className="block text-[0.8125rem] text-[var(--text-muted)]">
                      {guide.used.length > 0 ? `Used by ${guide.used.join(', ')}` : 'Used by the app itself'}
                    </span>
                  )}
                </TableCell>
                {MATRIX_TOOLS.map((tool, index) => (
                  <TableCell key={tool}>
                    {levels ? (
                      <StatusBadge shape="cell" tone={CELL[levels[index]].tone} icon={CELL[levels[index]].icon} label={CELL[levels[index]].label} />
                    ) : (
                      <span className="text-[var(--text-muted)]">Not listed</span>
                    )}
                  </TableCell>
                ))}
                <TableCell>
                  <Now support={report?.capabilities[key]} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
