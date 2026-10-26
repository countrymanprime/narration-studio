import { useMemo } from 'react';
import { DAW_CAPABILITIES, type DawCapabilities, type DawCapabilityLevel, type DawCapabilitySupport } from '../../../api/contracts/daw';
import { Button } from '../../primitives/Button';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { useDawCapabilityReport } from '../CapabilitySection';
import { keepFocusOnRemoval } from '../../layout/keepFocusOnRemoval';

// What takes the free width; Now holds a status badge and, when the tool cannot do it, the tool's own sentence.
const CAPABILITY_COLUMNS = ['auto', '60%'] as const;

const LABELS = new Map<string, string>(DAW_CAPABILITIES.map(({ key, label }) => [key, label]));
const LEVEL_WORD: Record<DawCapabilityLevel, string> = {
  supported: 'Available',
  experimental: 'Available',
  not_yet_available: 'Not yet available',
  unsupported: 'Unsupported',
};

/** The catalogue's order, then keys only the host knows (a newer host's), under their own key. */
function keysOf(report: DawCapabilities | undefined): string[] {
  const reported = report ? Object.keys(report.capabilities) : [];
  return [...DAW_CAPABILITIES.map(({ key }) => String(key)), ...reported.filter((key) => !LABELS.has(key))];
}

/** The tool's name for the table's title: the DAW's own, or "the recording tool" when the launch names none. */
const toolName = (report: DawCapabilities | undefined): string =>
  !report || report.daw === 'none' ? 'the recording tool' : report.daw === 'Built-in' ? 'the built-in recorder' : report.daw;

/** What the capability is now: available, or the host's own sentence for why not (the page never words a refusal). */
function Now({ support }: { support: DawCapabilitySupport | undefined }) {
  if (!support) return <span className="text-[var(--text-muted)]">Not reported</span>;
  if (support.available) return <StatusBadge tone="success" label="Available" />;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge tone="neutral" label="Unavailable" />
      <span className="text-[0.8125rem] text-[var(--text-muted)]">{support.message ?? LEVEL_WORD[support.level] ?? LEVEL_WORD.unsupported}</span>
    </span>
  );
}

/**
 * The body of "Capabilities": one line for each thing the app can ask the recording tool to do, and what the tool reports now. Nothing here
 * switches a capability on or off: what the linked tool can do is what it reports. The report is the host's, kept current by its event; the
 * sentence for an unavailable capability is the host's own.
 */
export function CapabilitiesBody() {
  const { report, loadError, retry } = useDawCapabilityReport();
  const keys = useMemo(() => keysOf(report), [report]);

  return (
    <div className="flex w-full flex-col gap-2">
      {loadError && !report && (
        <div className="flex flex-wrap items-center gap-3 text-[0.8125rem] text-[var(--danger-text)]" role="alert">
          <span>The recording tool’s capabilities could not be read: {loadError}.</span>
          <Button ref={keepFocusOnRemoval} variant="secondary" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      )}
      <Table label={`What ${toolName(report)} can do`} columns={CAPABILITY_COLUMNS}>
        <TableHead>
          <TableRow>
            <TableHeader>What</TableHeader>
            <TableHeader>Now</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {keys
            .filter((key) => report?.capabilities[key])
            .map((key) => (
              <TableRow key={key} data={{ 'data-capability': key }}>
                <TableCell>{LABELS.get(key) ?? key}</TableCell>
                <TableCell>
                  <Now support={report?.capabilities[key]} />
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
