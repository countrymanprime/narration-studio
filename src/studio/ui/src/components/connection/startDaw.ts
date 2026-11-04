import type { DawKind } from '../../api/contracts/daw';
import type { ProjectApi } from '../../api/contracts/project';
import type { SystemApi } from '../../api/contracts/system';
import { apiErrorMessage } from '../../api/errorMessage';
import { dawConnectGuide } from '../engine/dawConnectGuide';

/** What starting the DAW came to: the path the host started, or the host's own sentence for why nothing started. */
export type StartOutcome = { ok: true; path: string } | { ok: false; message: string };

/**
 * The one way the app starts a DAW (audit cluster 11, docs/research/ui-function-audit.md): the not-connected dialog, Settings' Engine row and the
 * Audacity card all start it here. A launcher runs only when REAPER is started with it, so REAPER's setting is saved first. What each screen does
 * after the start (wait for the bridge, say so in a toast) is its own.
 */
export async function startDaw(
  ports: { project: Pick<ProjectApi, 'launchDaw'>; system: Pick<SystemApi, 'saveSettings'> },
  daw: DawKind,
): Promise<StartOutcome> {
  try {
    const settings = dawConnectGuide(daw)?.launch.settings;
    if (settings) await ports.system.saveSettings('DAW', 'global', settings);
    const started = await ports.project.launchDaw();
    return { ok: true, path: started.path };
  } catch (error) {
    return { ok: false, message: apiErrorMessage(error) };
  }
}
