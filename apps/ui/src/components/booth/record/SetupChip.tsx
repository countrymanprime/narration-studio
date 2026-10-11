import type { DawCapabilities } from '../../../api/contracts/daw';
import { HeaderChip } from '../../primitives/HeaderChip';
import { TooltipTarget } from '../../primitives/Tooltip';

/**
 * The Booth top bar's recording-setup chip (the mock's `bsetup`): the name of what records, read from the capabilities. A setup
 * with no DAW has no name of its own to read, so the page passes the one it words. The chip is a button when `onClick` opens the
 * recording settings. The unsaved-changes note waits on `DawProjectState` (#1163).
 */
export function SetupChip({ capabilities, standaloneName, onClick }: { capabilities: DawCapabilities; standaloneName: string; onClick?: () => void }) {
  const standalone = capabilities.daw === 'none';
  const name = standalone ? standaloneName : capabilities.daw;
  const tone = !capabilities.reachable ? 'warning' : standalone ? 'neutral' : 'success';
  const detail = !capabilities.reachable
    ? (capabilities.capabilities.record?.message ?? `${name} is not answering`)
    : standalone
      ? 'Recording happens in the app'
      : `${name} linked`;
  return (
    <TooltipTarget text={`Recording settings · ${detail}`}>
      <HeaderChip tone={tone} onClick={onClick} role={onClick ? undefined : 'group'} aria-label={`Recording setup: ${name}`}>
        {name}
      </HeaderChip>
    </TooltipTarget>
  );
}
