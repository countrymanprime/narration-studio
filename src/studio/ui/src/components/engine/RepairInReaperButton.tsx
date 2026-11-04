import { DawToolsButton } from './DawToolsButton';

/**
 * The REAPER repair launchers as a button: `DawToolsButton` over the registry's `repair` group, named and drawn for what it does. Editing's Clean up
 * tab and Proof's inspector both render this one, so the name, the icon and the group cannot drift apart (#2821).
 */
export function RepairInReaperButton() {
  return <DawToolsButton groups={['repair']} label="Repair in REAPER" action="repairInReaper" />;
}
