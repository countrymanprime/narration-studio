import type { DawCapabilities, DawChoice, DawProjectState } from '../../../api/contracts/daw';
import { HeaderChip } from '../../primitives/HeaderChip';
import { TooltipTarget } from '../../primitives/Tooltip';

const UNSAVED = 'unsaved changes in the project';

/** The project's DAW and how it stands, from the host's choice payload: linked (and to which file), not linked, connected, not
 * running. The words name the DAW only from the payload. */
function choiceDetail(choice: DawChoice): string {
  const { daw, state, linkedFile, foundFiles } = choice;
  const linked = linkedFile ? `${daw} linked: ${linkedFile}` : `${daw} linked`;
  switch (state) {
    case 'connected':
      return linked;
    case 'linked':
      return `${linked} · not running · start it from Recording settings`;
    case 'not_running':
      return `${linked} · not running`;
    case 'not_linked':
      return foundFiles.length === 1
        ? `${daw} not linked · link ${foundFiles[0]} in Recording settings`
        : `${daw} not linked · link its project file in Recording settings`;
    case 'app':
      return 'Recording happens in the app';
    default:
      return 'No DAW chosen';
  }
}

/**
 * The Booth top bar's recording-setup chip (the mock's `bsetup`): the name of what records, read from the capabilities. A setup
 * with no DAW has no name of its own to read, so the page passes the one it words. The chip is a button when `onClick` opens the
 * recording settings, where the project's engine is chosen. With the project's DAW choice (`choice`), the chip's text, tooltip and
 * name say whether that DAW is linked, connected or not running, and the tone warns until it is connected. When the host reports
 * that the DAW's project has changes its saved file does not have (`DawProjectState`), the chip says so in its tooltip and its name.
 */
export function SetupChip({
  capabilities,
  standaloneName,
  project,
  choice,
  onClick,
}: {
  capabilities: DawCapabilities;
  standaloneName: string;
  project?: DawProjectState | null;
  choice?: DawChoice | null;
  onClick?: () => void;
}) {
  const standalone = choice ? choice.state === 'app' || choice.state === 'none' : capabilities.daw === 'none';
  const name = standalone ? standaloneName : (choice?.daw ?? capabilities.daw);
  const ready = choice ? choice.state === 'connected' || choice.state === 'app' : capabilities.reachable;
  const tone = !ready ? 'warning' : standalone ? 'neutral' : 'success';
  const detail = choice
    ? choiceDetail(choice)
    : !capabilities.reachable
      ? (capabilities.capabilities.record?.message ?? `${name} is not answering`)
      : standalone
        ? 'Recording happens in the app'
        : `${name} linked`;
  const unsaved = capabilities.reachable && !!project?.unsavedChanges;
  // The project's DAW short of connected says how far it got in the chip itself, not only in the tooltip.
  const stateWords = choice && !standalone && choice.state !== 'connected' ? choice.state.replace('_', ' ') : '';
  const state = stateWords ? `, ${stateWords}` : '';
  return (
    <TooltipTarget text={`Recording settings · ${detail}${unsaved ? ` · ${UNSAVED}` : ''}`}>
      <HeaderChip
        tone={tone}
        onClick={onClick}
        role={onClick ? undefined : 'group'}
        aria-label={`Recording setup: ${name}${state}${unsaved ? `, ${UNSAVED}` : ''}`}
      >
        {stateWords ? `${name} · ${stateWords}` : name}
      </HeaderChip>
    </TooltipTarget>
  );
}
