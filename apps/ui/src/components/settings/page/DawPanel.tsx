import { useCallback, useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { Bootstrap } from '../../../types';
import { Button } from '../../primitives/Button';
import { Dot } from '../../primitives/StatusBadge';
import type { Notify } from '../../primitives/Toast';
import { DawCatalogPanel } from '../DawCatalogPanel';
import { settingsSectionsFor } from '../sections';
import { ScopedFieldsPanel } from './ScopedFieldsPanel';

/** The project's link to a REAPER project file: what the host has stored, and the shared link action. */
function DawLink({ data, onLinkDawFile }: { data: Bootstrap; onLinkDawFile: () => void }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3 rounded-md p-3" style={{ background: 'var(--surface-2)' }}>
        <Dot color={data.dawFileLinked ? 'var(--character)' : 'var(--non-text)'} />
        <div>
          {/* Copy names only the one fact the host actually has (a stored link) - reachability is still unknown. */}
          <div className="font-medium">{data.dawFileLinked ? 'REAPER project linked' : 'No REAPER project linked'}</div>
          <div style={{ color: 'var(--text-muted)' }}>
            {data.dawFileLinked ? 'Tracks and Proof read from the linked .rpp file.' : 'Link a REAPER project (.rpp) file to unlock Tracks and Proof.'}
          </div>
        </div>
      </div>
      <Button variant="secondary" onClick={onLinkDawFile}>
        {data.dawFileLinked ? 'Change linked project file' : 'Link a REAPER project file'}
      </Button>
    </div>
  );
}

/**
 * Settings > DAW Integration, kept as built (the mock's Recording panel only picks the DAW): in Global, the DAW catalog,
 * whether REAPER is reachable, Launch REAPER, the DAW fields, the sections registered for `Daw` (capabilities, backups)
 * and the launcher path; in This project, the project's link to its .rpp file.
 */
export function DawPanel({ data, notify, onLinkDawFile }: { data: Bootstrap; notify: Notify; onLinkDawFile: () => void }) {
  const project = usePort('project');
  // Guards Launch REAPER against a second click starting a second REAPER while the first is still starting (ADR 0075).
  const [launching, setLaunching] = useState(false);
  const launch = useCallback(async () => {
    setLaunching(true);
    try {
      const result = await project.launchDaw();
      notify(`REAPER started (${result.path}).`);
    } catch (error) {
      notify(describeApiError(error), 'error');
    } finally {
      setLaunching(false);
    }
  }, [project, notify]);
  const launcher = data.runtime.Reaper?.launcherPath;

  return (
    <ScopedFieldsPanel
      id="daw"
      title="DAW Integration"
      tool="DAW"
      scopes={['global', 'project']}
      notify={notify}
      replace={({ scope }) => (scope === 'project' ? <DawLink data={data} onLinkDawFile={onLinkDawFile} /> : undefined)}
      before={() => (
        <>
          {/* A machine-wide detection fact, independent of any linked project (docs/architecture/daw-integration.md). */}
          <DawCatalogPanel notify={notify} dawFileLinked={data.dawFileLinked} onLinkDawFile={onLinkDawFile} />
          {/* Reachability is a live heartbeat, not a permanent "Connected" claim. */}
          <div className="flex items-center gap-3 rounded-md p-3" style={{ background: 'var(--surface-2)' }}>
            <Dot color={data.dawReachable ? 'var(--character)' : 'var(--non-text)'} />
            <div>
              <div className="font-medium">{data.dawReachable ? `${data.daw || 'REAPER'} is reachable` : 'REAPER is not reachable'}</div>
              <div style={{ color: 'var(--text-muted)' }}>
                {data.dawReachable
                  ? data.dawProjectMatches
                    ? 'Its open project matches the one linked here.'
                    : 'Its open project does not match the one linked here.'
                  : 'No recent signal from a running REAPER session. Start REAPER on the linked project, or use the button below.'}
              </div>
            </div>
          </div>
          <Button variant="secondary" type="button" disabled={!data.dawFileLinked || launching} onClick={() => void launch()}>
            {launching ? 'Starting REAPER…' : 'Launch REAPER'}
          </Button>
          {!data.dawFileLinked && <p style={{ color: 'var(--text-muted)' }}>Link a REAPER project (.rpp) file before starting REAPER.</p>}
          <div className="border-t" style={{ borderColor: 'var(--border)' }} />
        </>
      )}
      after={() => (
        <>
          {settingsSectionsFor('Daw').map(({ id, component: Section }) => (
            <Section key={id} />
          ))}
          {launcher && (
            <div className="rounded-md p-3" style={{ background: 'var(--surface-2)' }}>
              <div className="font-medium">REAPER launcher</div>
              <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
                Load this file once in REAPER (Actions, Show action list, New action, Load ReaScript), then run it with your project open to connect. Load it
                again after Narration Studio is moved or updated: the path changes. The app never changes REAPER for you.
              </p>
              <code className="mt-2 block rounded p-2 text-xs break-all" style={{ background: 'var(--surface)' }}>
                {launcher}
              </code>
              <Button
                variant="secondary"
                className="mt-2"
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(launcher)
                    .then(() => notify('REAPER launcher path copied.'))
                    .catch(() => notify('Could not copy the REAPER launcher path.', 'error'))
                }
              >
                Copy path
              </Button>
            </div>
          )}
        </>
      )}
    />
  );
}
