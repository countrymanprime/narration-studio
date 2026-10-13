import type { DawCapabilities } from '../../../api/contracts/daw';
import { dawConnectGuide, type DawConnectGuide } from '../../engine/dawConnectGuide';

/** What the Booth's setup steps need from the host's bootstrap: whether the DAW's project file is linked, and the launcher's file. */
export type RecordSetupFacts = { dawFileLinked: boolean; launcherPath: string };

/**
 * The one-time setup Record is waiting for, or null when Record is available or nothing the narrator can do here would make it so.
 * `turn-on`: the record capability is Experimental and switched off (ADR 0230), or turned off by its own toggle; one click turns it on.
 * `connect`: the DAW's bridge is not connected to this app, or has stopped answering, and the DAW has a guide to connect it
 * (`dawConnectGuide`): link the project, put the bridge in the DAW once, and run it.
 */
export type RecordSetupPlan =
  { kind: 'turn-on'; dawName: string } | { kind: 'connect'; guide: DawConnectGuide; notAnswering: boolean; linked: boolean; launcherPath: string };

export function recordSetupFor(capabilities: DawCapabilities, facts: RecordSetupFacts): RecordSetupPlan | null {
  const record = capabilities.capabilities.record;
  if (!record || record.available) return null;
  switch (record.reason) {
    case 'experimental_off':
    case 'turned_off':
      return { kind: 'turn-on', dawName: capabilities.daw === 'none' ? 'the DAW' : capabilities.daw };
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
