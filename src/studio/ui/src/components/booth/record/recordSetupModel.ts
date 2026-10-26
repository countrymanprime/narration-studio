import type { DawCapabilities } from '../../../api/contracts/daw';
import { dawConnectGuide, type DawConnectGuide } from '../../engine/dawConnectGuide';
import type { OpenProject } from './recordCheck';
import { recorderName } from '../../../studio/dawNames';

/** What the Booth's setup steps need from the host's bootstrap: whether the DAW's project file is linked, and the launcher's file. */
export type RecordSetupFacts = {
  dawFileLinked: boolean;
  launcherPath: string;
  /** Whether the project the DAW has open is the linked one; `unknown` (or absent) while nothing is linked or the DAW has not been heard. */
  openProject?: OpenProject;
};

/**
 * The one-time setup Record is waiting for, or null when Record is available or nothing the narrator can do here would make it so.
 * `connect`: the DAW's bridge is not connected to this app, or has stopped answering, and the DAW has a guide to connect it
 * (`dawConnectGuide`): link the project, put the bridge in the DAW once, and run it.
 * `other-project`: Record could start, but the DAW has a different project open than the one linked here, so a take would land in the
 * wrong project; the narrator links the open one, or opens the linked one in the DAW.
 */
export type RecordSetupPlan =
  { kind: 'connect'; guide: DawConnectGuide; notAnswering: boolean; linked: boolean; launcherPath: string } | { kind: 'other-project'; dawName: string };

export function recordSetupFor(capabilities: DawCapabilities, facts: RecordSetupFacts): RecordSetupPlan | null {
  const record = capabilities.capabilities.record;
  // What stops Record altogether comes first; a wrong project is only the problem once Record could start.
  if (record?.available && facts.openProject === 'different') {
    return { kind: 'other-project', dawName: recorderName(capabilities.daw) };
  }
  if (!record || record.available) return null;
  switch (record.reason) {
    case 'standalone':
    case 'not_running': {
      const guide = dawConnectGuide(capabilities.daw);
      if (!guide) return null;
      return { kind: 'connect', guide, notAnswering: record.reason === 'not_running', linked: facts.dawFileLinked, launcherPath: facts.launcherPath };
    }
    default:
      return null;
  }
}
