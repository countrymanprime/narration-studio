import { useMemo } from 'react';
import { DAW_CAPABILITIES, type DawCapabilities, type DawCapabilityLevel, type DawCapabilitySupport } from '../../../api/contracts/daw';
import { Button } from '../../primitives/Button';
import { Select } from '../../primitives/Select';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { useDawCapabilityReport } from '../CapabilitySection';
import { useSettingsStore } from '../data/SettingsStore';
import { computerValue } from '../data/values';
import { rowOf } from '../registry/rows';
import type { SettingMeta } from '../registry/types';
import { keepFocusOnRemoval } from '../../layout/keepFocusOnRemoval';

// What takes the free width; Setting holds the Auto/On/Off select and Now a status badge, so neither needs more (alignment audit XSE2-4).
const CAPABILITY_COLUMNS = ['auto', '6.5rem', '8.5rem'] as const;

const LABELS = new Map<string, string>(DAW_CAPABILITIES.map(({ key, label }) => [key, label]));
const MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];
const LEVEL_WORD: Record<DawCapabilityLevel, string> = {
  supported: 'Available',
  experimental: 'Experimental',
  not_yet_available: 'Not yet available',
  unsupported: 'Unsupported',
};

/** The catalogue's order, then keys only the host knows (a newer host's), under their own key. */
function keysOf(report: DawCapabilities | undefined): string[] {
  const reported = report ? Object.keys(report.capabilities) : [];
  return [...DAW_CAPABILITIES.map(({ key }) => String(key)), ...reported.filter((key) => !LABELS.has(key))];
}

/** What the capability is now: the host's level, and its own sentence when it cannot be used (the page never words a refusal). */
function Now({ support }: { support: DawCapabilitySupport | undefined }) {
  if (!support) return <span className="text-[var(--text-muted)]">Not reported</span>;
  if (support.available) {
    return support.level === 'experimental' ? <StatusBadge tone="experimental" label="Experimental" /> : <StatusBadge tone="success" label="Available" />;
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge tone="neutral" label="Unavailable" />
      <span className="text-[0.8125rem] text-[var(--text-muted)]">{support.message ?? LEVEL_WORD[support.level] ?? LEVEL_WORD.unsupported}</span>
    </span>
  );
}

/**
 * The body of "Capabilities": one line for each thing the app can ask the recording tool to do, with its setting (Auto follows the tool, On
 * and Off override it; `DAW.capability.<key>`, this computer) and what the tool reports now. The report is the host's, kept current by its
 * event; the sentence for an unavailable capability is the host's own.
 */
export function CapabilitiesBody() {
  const store = useSettingsStore();
  const { report, loadError, retry } = useDawCapabilityReport();
  const base = rowOf('daw.capabilities')!;
  const keys = useMemo(() => keysOf(report), [report]);
  // One synthetic row per capability, so a save goes through the page's store and reads as a change to this row ("Saved", the error).
  const rowFor = (key: string): SettingMeta => ({ ...base, label: LABELS.get(key) ?? key, field: { tool: 'DAW', key: `capability.${key}` }, def: 'auto' });

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
      <Table label="What the recording tool can do" columns={CAPABILITY_COLUMNS}>
        <TableHead>
          <TableRow>
            <TableHeader>What</TableHeader>
            <TableHeader>Setting</TableHeader>
            <TableHeader>Now</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {keys
            .filter((key) => store.fieldsOf(rowFor(key)).global || report?.capabilities[key])
            .map((key) => {
              const row = rowFor(key);
              const field = store.fieldsOf(row).global;
              return (
                <TableRow key={key} data={{ 'data-capability': key }}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell>
                    {field ? (
                      <Select
                        label={row.label}
                        value={computerValue(row, field)}
                        options={MODES}
                        onChange={(next) => void store.write(row, 'global', next === 'auto' ? null : next)}
                      />
                    ) : (
                      <span className="text-[var(--text-muted)]">Auto</span>
                    )}
                  </TableCell>
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
