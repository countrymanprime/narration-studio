import { useCallback, useEffect, useState } from 'react';
import { DAW_CAPABILITIES, type DawCapabilities, type DawCapabilityLevel, type DawCapabilityMode, type DawCapabilitySupport } from '../../api/contracts/daw';
import { describeApiError } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import { Button } from '../primitives/Button';
import { SectionLabel } from '../primitives/SectionLabel';
import { statusLabel, statusTone, type StatusId } from '../../kinds/statusTone';
import { StatusBadge } from '../primitives/StatusBadge';

// Each level is a word and a glyph, so no level is told apart by colour alone.
const LEVEL: Record<DawCapabilityLevel, { status: StatusId; glyph: string }> = {
  supported: { status: 'supported', glyph: '✓' },
  experimental: { status: 'experimental', glyph: '◇' },
  not_yet_available: { status: 'not_yet_available', glyph: '…' },
  unsupported: { status: 'unsupported', glyph: '✕' },
};

const MODE: Record<DawCapabilityMode, string> = {
  native: 'The DAW does it in one step',
  app: 'The app does it',
  steps: 'The app makes the edits one after another',
};

const DESTRUCTIVE_CHIP = 'Replaces audio that cannot be brought back';

const LABELS = new Map<string, string>(DAW_CAPABILITIES.map(({ key, label }) => [key, label]));

/** The catalogue's order first, then keys this build does not know (a newer host's), under their own key. */
function orderedKeys(report: DawCapabilities): string[] {
  const known = DAW_CAPABILITIES.map(({ key }) => String(key)).filter((key) => key in report.capabilities);
  const unknown = Object.keys(report.capabilities).filter((key) => !LABELS.has(key));
  return [...known, ...unknown];
}

function CapabilityRow({ name, support }: { name: string; support: DawCapabilitySupport }) {
  const level = LEVEL[support.level] ?? LEVEL.unsupported;
  return (
    <li className="flex flex-col gap-1 py-2" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{name}</span>
        <span data-testid="capability-level">
          <StatusBadge tone={statusTone(level.status)} label={statusLabel(level.status)} icon={level.glyph} />
        </span>
        {support.destructive && <StatusBadge tone="warning" label={DESTRUCTIVE_CHIP} icon="⚠" />}
      </div>
      {!support.available && support.message && <div style={{ color: 'var(--text-muted)' }}>{support.message}</div>}
      {support.mode && <div style={{ color: 'var(--text-muted)' }}>{MODE[support.mode]}</div>}
    </li>
  );
}

/** The rows for one report, or the empty-report sentence. Props only, so the story can show every state. */
export function CapabilityList({ report }: { report: DawCapabilities }) {
  const keys = orderedKeys(report);
  if (keys.length === 0) return <p style={{ color: 'var(--text-muted)' }}>No DAW reported capabilities.</p>;
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {keys.map((key) => (
        <CapabilityRow key={key} name={LABELS.get(key) ?? key} support={report.capabilities[key]} />
      ))}
    </ul>
  );
}

/**
 * The host's whole capability report, read once and kept current by `daw_capabilities_changed`, with the same stale-read guard as
 * `useCapability` (an event that arrives before the first read wins). `retry` reads again after a failed read.
 */
export function useDawCapabilityReport() {
  const api = usePort('dawCapabilities');
  const [report, setReport] = useState<DawCapabilities>();
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let receivedEvent = false;
    const unsubscribe = api.subscribeDawCapabilities((next) => {
      receivedEvent = true;
      setReport(next);
      setLoadError('');
    });
    api
      .dawCapabilities()
      .then((next) => {
        if (receivedEvent) return;
        setReport(next);
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (!receivedEvent) setLoadError(describeApiError(error));
      });
    return unsubscribe;
  }, [api, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { report, loadError, retry };
}

/**
 * What the connected DAW can do right now, one row per capability the host reports: its level, the host's own sentence when
 * it is unavailable (the UI never words a refusal), a warning chip when using it replaces audio that cannot be brought back,
 * and how a change needing several edits is made. The report comes from `useDawCapabilityReport`. It sits beside the per-capability toggles
 * (`DAW.capability.<name>`), which stay where they are.
 */
export function CapabilitySection() {
  const { report, loadError, retry } = useDawCapabilityReport();

  return (
    <section aria-labelledby="daw-capabilities-label" className="space-y-2 pt-3">
      <SectionLabel as="h3" id="daw-capabilities-label">
        What the DAW can do
      </SectionLabel>
      {loadError && !report ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md p-3"
          role="alert"
          style={{ background: 'var(--review-soft)', color: 'var(--danger-text)' }}
        >
          <span>The DAW's capabilities could not be read: {loadError}.</span>
          <Button variant="secondary" type="button" onClick={retry}>
            Retry
          </Button>
        </div>
      ) : report ? (
        <CapabilityList report={report} />
      ) : null}
    </section>
  );
}
