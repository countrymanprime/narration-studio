import type { DawCapabilities, DawProjectState } from '../../../api/contracts/daw';
import { HeaderChip } from '../../primitives/HeaderChip';
import { TooltipTarget } from '../../primitives/Tooltip';

const UNSAVED = 'unsaved changes in the project';

/**
 * The Booth top bar's recording-setup chip (the mock's `bsetup`): the name of what records, read from the capabilities. A setup
 * with no DAW has no name of its own to read, so the page passes the one it words. The chip is a button when `onClick` opens the
 * recording settings. When the host reports that the DAW's project has changes its saved file does not have (`DawProjectState`), the chip
 * says so in its tooltip and its name.
 */
export function SetupChip({
  capabilities,
  standaloneName,
  project,
  onClick,
}: {
  capabilities: DawCapabilities;
  standaloneName: string;
  project?: DawProjectState | null;
  onClick?: () => void;
}) {
  const standalone = capabilities.daw === 'none';
  const name = standalone ? standaloneName : capabilities.daw;
  const tone = !capabilities.reachable ? 'warning' : standalone ? 'neutral' : 'success';
  const detail = !capabilities.reachable
    ? (capabilities.capabilities.record?.message ?? `${name} is not answering`)
    : standalone
      ? 'Recording happens in the app'
      : `${name} linked`;
  const unsaved = capabilities.reachable && !!project?.unsavedChanges;
  return (
    <TooltipTarget text={`Recording settings · ${detail}${unsaved ? ` · ${UNSAVED}` : ''}`}>
      <HeaderChip tone={tone} onClick={onClick} role={onClick ? undefined : 'group'} aria-label={`Recording setup: ${name}${unsaved ? `, ${UNSAVED}` : ''}`}>
        {name}
      </HeaderChip>
    </TooltipTarget>
  );
}
