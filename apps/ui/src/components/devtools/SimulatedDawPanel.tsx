import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { clock, type SimulatedDaw, type SimulatedDawEvent } from '../../api/mockHost/simulatedDaw';
import { Button } from '../primitives/Button';
import { Dot } from '../primitives/StatusBadge';

// The public demo's "Simulated DAW" badge and panel (src/api/mockHost/simulatedDaw.ts holds what it shows). It is the demo's stand-in for the
// window of REAPER or Audacity beside the app: where the cursor is, the take markers dropped, the takes recorded and what the app asked the DAW
// to do. It is not part of the app: only the site build mounts it, in its own root, and it reads the DAW through the simulation and the mock
// DAW's control, never through a page. It is non-modal on purpose, so the app stays usable while it shows what happens in the "DAW".
type SimulatedDawControl = {
  state(): { daw: string; reachable: boolean; openProject: 'linked' | 'other'; recording: boolean };
  quiet(): void;
  heartbeat(): void;
};

const KIND_LABEL: Record<SimulatedDawEvent['kind'], string> = {
  cursor: 'Cursor',
  marker: 'Marker',
  pickup: 'Pickup',
  record: 'Record',
  take: 'Take',
  render: 'Render',
  cleanup: 'Cleanup',
  link: 'Link',
  refused: 'Refused',
};

const TIMELINE_MIN_SECONDS = 600;

/** How the simulated machine starts: `linked` is REAPER open on the linked project, `unlinked` a fresh machine whose project folder holds an
 * .rpp to link (Settings > Recording), `audacity` the other DAW. The mock reads these once at boot (main.tsx), so a choice reloads the page. */
type DawScenario = 'linked' | 'unlinked' | 'audacity';

const SCENARIO_PARAMS: Record<DawScenario, Record<string, string | null>> = {
  linked: { mockDaw: null, mockDawChoice: null },
  unlinked: { mockDaw: 'live', mockDawChoice: 'found' },
  audacity: { mockDaw: 'Audacity', mockDawChoice: null },
};

function restartWith(scenario: DawScenario): void {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(SCENARIO_PARAMS[scenario])) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  window.location.assign(`${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

export function SimulatedDawPanel({
  sim,
  control,
  boot = restartWith,
}: {
  sim: SimulatedDaw;
  control: () => SimulatedDawControl | undefined;
  boot?: (scenario: DawScenario) => void;
}) {
  const [open, setOpen] = useState(false);
  const snapshot = useSyncExternalStore(sim.subscribe, sim.snapshot);
  // The DAW's own state moves on its own heartbeat, so it is read on a timer while the panel is open and once more on every action.
  const [live, setLive] = useState(() => control()?.state());
  useEffect(() => {
    setLive(control()?.state());
    if (!open) return;
    const timer = window.setInterval(() => setLive(control()?.state()), 1000);
    return () => window.clearInterval(timer);
  }, [open, control, snapshot]);

  const daw = live?.daw === 'Audacity' ? 'Audacity' : 'REAPER';
  const unlinkedStart = new URLSearchParams(window.location.search).has('mockDawChoice');
  const answering = live?.reachable ?? false;
  const span = Math.max(TIMELINE_MIN_SECONDS, snapshot.cursor?.seconds ?? 0, ...snapshot.markers.map((marker) => marker.seconds)) * 1.05;
  const at = (seconds: number) => `${Math.min(100, (seconds / span) * 100)}%`;

  return (
    <div
      className="fixed right-3 bottom-24 z-[var(--z-takeover)] flex max-w-[calc(100vw-1.5rem)] flex-col-reverse items-end gap-2 text-sm font-[var(--font-body,inherit)]"
      data-simulated-daw
    >
      <Button variant="secondary" size="sm" aria-expanded={open} aria-controls="simulated-daw-panel" onClick={() => setOpen((was) => !was)}>
        <Dot color={answering ? 'var(--ok)' : 'var(--text-muted)'} />
        <span>
          Simulated DAW · {daw}
          {snapshot.recording ? ' · recording' : ''}
        </span>
      </Button>
      {open && (
        <section
          id="simulated-daw-panel"
          aria-label="Simulated DAW"
          className="max-h-[min(22rem,50vh)] w-[min(21rem,calc(100vw-1.5rem))] overflow-auto rounded-[var(--radius-card,8px)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text)] shadow-[var(--shadow-lg,0_4px_16px_rgba(0,0,0,0.25))]"
        >
          <p className="text-[var(--text-muted)]">
            A stand-in for {daw === 'REAPER' ? 'REAPER' : 'Audacity'}, running in this tab. The app talks to it exactly as it would to the real one; nothing
            leaves your browser.
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-[var(--text-muted)]">Connection</dt>
            <dd>{answering ? 'Answering' : 'Not answering'}</dd>
            <dt className="text-[var(--text-muted)]">Project</dt>
            <dd>{live?.openProject === 'other' ? 'A different project is open' : 'Alice.rpp'}</dd>
            <dt className="text-[var(--text-muted)]">Transport</dt>
            <dd>{snapshot.recording ? 'Recording' : 'Stopped'}</dd>
            <dt className="text-[var(--text-muted)]">Cursor</dt>
            <dd>{snapshot.cursor ? `${snapshot.cursor.label} · ${clock(snapshot.cursor.seconds)}` : 'Nowhere yet'}</dd>
            <dt className="text-[var(--text-muted)]">Takes</dt>
            <dd>{snapshot.takes === 0 ? 'None recorded' : `${snapshot.takes} added this visit`}</dd>
          </dl>
          <div
            role="img"
            aria-label={`Project timeline: ${snapshot.markers.length} take markers`}
            className="relative mt-3 h-8 rounded border border-[var(--border)] bg-[var(--surface-2)]"
          >
            {snapshot.markers.map((marker) => (
              <span
                key={marker.seconds}
                title={`${marker.label} · ${clock(marker.seconds)}`}
                className="absolute inset-y-1 w-0.5 bg-[var(--accent)]"
                style={{ left: at(marker.seconds) }}
              />
            ))}
            {snapshot.cursor && <span className="absolute inset-y-0 w-0.5 bg-[var(--focus)]" style={{ left: at(snapshot.cursor.seconds) }} />}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {snapshot.markers.length === 0
              ? 'No take markers yet. Add one from a Proof note.'
              : `${snapshot.markers.length} take marker${snapshot.markers.length === 1 ? '' : 's'} (orange), cursor (blue).`}
          </p>
          <h3 className="mt-3 font-semibold">What the app asked the DAW</h3>
          {snapshot.events.length === 0 ? (
            <p className="text-[var(--text-muted)]">Nothing yet. Try Show in REAPER on a Proof note, or link and record from the Booth.</p>
          ) : (
            <ol className="mt-1 space-y-1">
              {snapshot.events.slice(0, 8).map((event) => (
                <li key={event.id} className="flex gap-2">
                  <span className="w-14 shrink-0 text-[var(--text-muted)]">{KIND_LABEL[event.kind]}</span>
                  <span style={event.kind === 'refused' ? { color: 'var(--danger-text, var(--danger))' } : undefined}>{event.text}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => boot(daw === 'REAPER' ? 'audacity' : 'linked')}>
              Switch to {daw === 'REAPER' ? 'Audacity' : 'REAPER'}
            </Button>
            {daw === 'REAPER' && (
              <Button variant="secondary" size="sm" onClick={() => boot(unlinkedStart ? 'linked' : 'unlinked')}>
                {unlinkedStart ? 'Start already linked' : 'Start unlinked'}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const dawControl = control();
                if (answering) dawControl?.quiet();
                else dawControl?.heartbeat();
                setLive(dawControl?.state());
              }}
            >
              {answering ? 'Make it stop answering' : 'Make it answer'}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Mounts the badge in its own root on `document.body`, so it stays out of the app's tree. */
export function mountSimulatedDawPanel(sim: SimulatedDaw, control: () => SimulatedDawControl | undefined): void {
  const host = document.createElement('div');
  document.body.append(host);
  createRoot(host).render(<SimulatedDawPanel sim={sim} control={control} />);
}
