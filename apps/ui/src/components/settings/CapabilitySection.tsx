import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { DAW_CAPABILITIES, type DawCapabilities, type DawCapabilityLevel, type DawCapabilityMode, type DawCapabilitySupport } from '../../api/contracts/daw';
import { describeApiError } from '../../api/errorMessage';
import { Button } from '../primitives/Button';
import { SectionLabel } from '../primitives/SectionLabel';
import { StatusBadge, type StatusTone } from '../primitives/StatusBadge';

// Each level is a word and a glyph, so no level is told apart by colour alone.
const LEVEL: Record<DawCapabilityLevel, { label: string; glyph: string; tone: StatusTone }> = {
  supported: { label: 'Supported', glyph: '✓', tone: 'success' },
  experimental: { label: 'Experimental', glyph: '◇', tone: 'experimental' },
  not_yet_available: { label: 'Not yet available', glyph: '…', tone: 'neutral' },
  unsupported: { label: 'Unsupported', glyph: '✕', tone: 'neutral' },
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
          <StatusBadge tone={level.tone} label={level.label} icon={level.glyph} />
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
 * What the connected DAW can do right now, one row per capability the host reports: its level, the host's own sentence when
 * it is unavailable (the UI never words a refusal), a warning chip when using it replaces audio that cannot be brought back,
 * and how a change needing several edits is made. The whole report is read once and kept current by
 * `daw_capabilities_changed`, with the same stale-read guard as `useCapability`. It sits beside the per-capability toggles
 * (`DAW.capability.<name>`), which stay where they are.
 */
export function CapabilitySection() {
  const api = useApi();
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
