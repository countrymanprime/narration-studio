import { useMemo } from 'react';
import { useLayoutClass } from '../../hooks/useLayoutClass';
import { DAW_CAPABILITIES, type DawCapabilities, type DawCapabilityLevel, type DawCapabilitySupport } from '../../api/contracts/daw';
import { recorderName } from '../../studio/dawNames';
import { CAPABILITY_GUIDE, placeLabel } from '../../daw/capabilityGuide';
import { CAPABILITY_MATRIX, MATRIX_TOOLS, type MatrixCell } from '../../daw/capabilityMatrix';
import { usePendingAction } from '../../hooks/usePendingAction';
import { CheckedStamp, useCheckedAt } from '../primitives/CheckedStamp';
import { IconButton } from '../primitives/IconButton';
import { StatusBadge } from '../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { keepFocusOnRemoval } from '../layout/keepFocusOnRemoval';

// What takes the free width, one narrow column for each tool, and Now, which holds a badge and, when the tool cannot do it, the tool's own sentence.
const COLUMNS = ['auto', '7rem', '7rem', '7rem', '7rem', '10rem'] as const;
// In a narrow window the four tools fold into a line under each capability, so nothing scrolls sideways.
const NARROW_COLUMNS = ['auto', '8.5rem'] as const;

const LABELS = new Map<string, string>(DAW_CAPABILITIES.map(({ key, label }) => [key, label]));
const LEVEL_WORD: Record<DawCapabilityLevel, string> = {
  supported: 'Available',
  experimental: 'Available',
  not_yet_available: 'Not yet available',
  unsupported: 'Unsupported',
};
// What a header's tooltip says: the words in its column, and why a tool is "No" all the way down.
const TOOL_INFO: Record<(typeof MATRIX_TOOLS)[number], string> = {
  REAPER: 'Yes: the app can do it with this tool. Not yet: the app has not built it for this tool. No: this tool cannot do it.',
  'Audacity 3': 'Yes: the app can do it with this tool. Not yet: the app has not built it for this tool. No: this tool cannot do it.',
  'Audacity 4': 'Audacity 4 has no scripting pipe, so the app cannot reach it.',
  'Built-in recorder': 'The app’s own recorder: it records, and has no project to edit.',
};
const CELL: Record<MatrixCell, { label: string; tone: 'success' | 'neutral' | 'warning'; icon: string }> = {
  yes: { label: 'Yes', tone: 'success', icon: '✓' },
  soon: { label: 'Not yet', tone: 'warning', icon: '' },
  no: { label: 'No', tone: 'neutral', icon: '✕' },
};

/** The catalogue's order, then keys only the host knows (a newer host's), under their own key. */
function keysOf(report: DawCapabilities | undefined): string[] {
  // A key with nothing visible in it would draw a row with no name, so it is left out.
  const reported = report ? Object.keys(report.capabilities).filter((key) => key.trim() !== '') : [];
  return [...DAW_CAPABILITIES.map(({ key }) => String(key)), ...reported.filter((key) => !LABELS.has(key))];
}

/** What the capability is now: available, or the host's own sentence for why not (the page never words a refusal). */
function Now({ support, reading }: { support: DawCapabilitySupport | undefined; reading: boolean }) {
  if (!support) return <span className="text-[var(--text-muted)]">{reading ? 'Reading…' : 'Not reported'}</span>;
  if (support.available) return <StatusBadge tone="success" label="Available" />;
  return (
    <span className="flex flex-col items-start gap-1 [overflow-wrap:anywhere]">
      <StatusBadge tone="neutral" label="Unavailable" />
      <span className="text-[0.8125rem] text-[var(--text-muted)]">{support.message?.trim() || LEVEL_WORD[support.level] || LEVEL_WORD.unsupported}</span>
    </span>
  );
}

/** The folded layout's line for the tools: who does it, and who the app has not built it for yet. */
function worksWith(levels: readonly MatrixCell[]): string {
  const named = (cell: MatrixCell) => MATRIX_TOOLS.filter((_, index) => levels[index] === cell).join(', ');
  const yes = named('yes');
  const soon = named('soon');
  return `${yes ? `Works with ${yes}` : 'Works with no tool yet'}${soon ? `. Not built yet for ${soon}` : ''}`;
}

/** How many of the capabilities the host reports are available now, for the one-line Settings row. */
export function availableCount(report: DawCapabilities | undefined): { available: number; total: number } {
  // Over the rows the dialog lists, so the line and the table agree whatever the host sends.
  const all = report
    ? keysOf(report)
        .filter((key) => Object.hasOwn(report.capabilities, key))
        .map((key) => report.capabilities[key])
    : [];
  return { available: all.filter((support) => support.available).length, total: all.length };
}

/**
 * What the recording tools can do, one row for each thing the app can ask of them: what it is for and where the app uses it, whether each of
 * the four tools does it, and what the linked tool reports now. Props only, so the story and the tests show every state. Nothing here
 * switches a capability on or off. The levels are the adapters' own declarations (`capabilityMatrix.ts`); Now is the host's.
 */
export function CapabilityReference({
  report,
  loadError,
  onRetry,
}: {
  report: DawCapabilities | undefined;
  loadError: string;
  onRetry: () => void | Promise<void>;
}) {
  const keys = useMemo(() => keysOf(report), [report]);
  const narrow = useLayoutClass().narrow;
  // Retry reads again: it shows busy until the read is back, a second press while it runs does nothing (#3740), and a read that fails again
  // still answers with the time it finished, so the press never looks dead.
  const pending = usePendingAction();
  const [checkedAt, markChecked, reads] = useCheckedAt();
  const retry = () =>
    pending.run('retry', async () => {
      try {
        await onRetry();
      } catch {
        // The caller shows why a read failed (loadError); the button only has to come back.
      }
      markChecked();
    });
  return (
    <div className="flex w-full flex-col gap-3">
      {loadError && !report && (
        <div className="flex flex-wrap items-center gap-3 text-[0.8125rem] text-[var(--danger-text)]" role="alert">
          <span>The recording tool’s capabilities could not be read: {loadError.replace(/^Error: /, '').replace(/\.+$/, '')}.</span>
          <IconButton action="retry" ref={keepFocusOnRemoval} size="sm" pending={pending.isPending('retry')} onClick={() => void retry()} />
          <CheckedStamp at={checkedAt} reads={reads} />
        </div>
      )}
      <Table label="What the recording tools can do" columns={narrow ? NARROW_COLUMNS : COLUMNS}>
        <TableHead sticky>
          <TableRow>
            <TableHeader>What</TableHeader>
            {!narrow &&
              MATRIX_TOOLS.map((tool) => (
                <TableHeader key={tool} info={TOOL_INFO[tool]}>
                  {tool === 'Built-in recorder' ? 'Built-in' : tool}
                </TableHeader>
              ))}
            <TableHeader>{narrow ? 'Now' : `Now in ${recorderName(report?.daw)}`}</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {keys.map((key) => {
            const known = Object.hasOwn(CAPABILITY_GUIDE, key);
            const guide = known ? CAPABILITY_GUIDE[key as keyof typeof CAPABILITY_GUIDE] : undefined;
            const levels = known ? CAPABILITY_MATRIX[key as keyof typeof CAPABILITY_MATRIX] : undefined;
            return (
              <TableRow key={key} data={{ 'data-capability': key }}>
                <TableCell>
                  <span className="block font-medium [overflow-wrap:anywhere]">{LABELS.get(key) ?? key}</span>
                  {guide && <span className="block text-[0.8125rem] text-[var(--text-muted)]">{guide.does}</span>}
                  {guide && (
                    <span className="block text-[0.8125rem] text-[var(--text-muted)]">
                      {guide.used.length > 0 ? `Used by ${guide.used.map(placeLabel).join(', ')}` : 'Used by the app itself'}
                    </span>
                  )}
                  {narrow && <span className="block text-[0.8125rem] text-[var(--text-muted)]">{levels ? worksWith(levels) : 'Not listed'}</span>}
                </TableCell>
                {!narrow &&
                  MATRIX_TOOLS.map((tool, index) => (
                    <TableCell key={tool} align="center">
                      {levels ? (
                        <StatusBadge shape="cell" tone={CELL[levels[index]].tone} icon={CELL[levels[index]].icon} label={CELL[levels[index]].label} />
                      ) : (
                        <span className="text-[var(--text-muted)]">Not listed</span>
                      )}
                    </TableCell>
                  ))}
                <TableCell>
                  <Now support={report && Object.hasOwn(report.capabilities, key) ? report.capabilities[key] : undefined} reading={!report && !loadError} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
