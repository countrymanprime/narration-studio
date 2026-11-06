import type { DawCapabilities, DawChoice, DawProjectState } from '../../../api/contracts/daw';
import { recordsInApp } from '../../../studio/dawNames';
import { EngineChipButton } from '../../engine/EngineChipButton';

const UNSAVED = 'unsaved changes in the project';

/** The project's DAW and how it stands, from the host's choice payload: linked (and to which file), not linked, connected, starting,
 * not running, and the host's sentence when its bridge in the DAW has a problem. The words name the DAW only from the payload. */
function choiceDetail(choice: DawChoice): string {
  const detail = stateDetail(choice);
  return choice.bridge?.problem ? `${detail} · ${choice.bridge.problem}` : detail;
}

function stateDetail(choice: DawChoice): string {
  const { daw, state, linkedFile, foundFiles } = choice;
  const linked = linkedFile ? `${daw} linked: ${linkedFile}` : `${daw} linked`;
  switch (state) {
    case 'connected':
      return linked;
    case 'starting':
      return `${linked} · opening ${daw}, connecting on its own`;
    case 'linked':
      return `${linked} · not running · start it in the DAW`;
    case 'not_running':
      return `${linked} · not running`;
    case 'not_linked':
      return foundFiles.length === 1 ? `${daw} not linked · link ${foundFiles[0]}` : `${daw} not linked · link its project file`;
    case 'app':
      return 'Recording happens in the app';
    default:
      return 'No DAW chosen';
  }
}

/**
 * The Booth top bar's recording-setup chip (the mock's `bsetup`): the name of what records, read from the capabilities. A setup
 * with no DAW has no name of its own to read, so the page passes the one it words. A DAW's chip is a button: like the header's engine chip it opens the Audio engine panel (`EngineChipButton`),
 * whose Recording settings link is where the project's engine is chosen. The app's own recorder's chip opens Recording settings instead. With the project's DAW choice (`choice`), the chip's text, tooltip and
 * name say whether that DAW is linked, connected or not running, and the tone warns until it is connected. When the host reports
 * that the DAW's project has changes its saved file does not have (`DawProjectState`), the chip says so in its tooltip and its name.
 * `otherProject` is the setup notice's own finding that the DAW has another project open: connected, but not ready, so the chip warns
 * and says so, as the notice and its dialog do (alignment audit R4BO2-1).
 */
export function SetupChip({
  capabilities,
  standaloneName,
  project,
  choice,
  otherProject = false,
  trackProblem,
}: {
  capabilities: DawCapabilities;
  standaloneName: string;
  project?: DawProjectState | null;
  choice?: DawChoice | null;
  otherProject?: boolean;
  /** The Booth's own finding that the chapter has no track in the DAW project (`none`) or several (`several`): connected, but Record cannot start, so the chip warns. */
  trackProblem?: 'none' | 'several';
}) {
  const standalone = choice ? choice.state === 'app' || choice.state === 'none' : capabilities.daw === 'none' || recordsInApp(capabilities.daw);
  const name = standalone ? standaloneName : (choice?.daw ?? capabilities.daw);
  // The app's own recorder has no track to link.
  const trackIssue = standalone ? undefined : trackProblem;
  const ready = !otherProject && !trackIssue && (choice ? choice.state === 'connected' || choice.state === 'app' : capabilities.reachable);
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
  const dawShort = choice && !standalone && choice.state !== 'connected' ? (choice.state === 'linked' ? 'not running' : choice.state.replace('_', ' ')) : '';
  const stateWords = otherProject ? 'other project' : dawShort || (trackIssue === 'none' ? 'no track' : trackIssue === 'several' ? 'several tracks' : '');
  const state = stateWords ? `, ${stateWords}` : '';
  const trackSentence = trackIssue === 'none' ? 'this chapter has no track to record on' : 'this chapter is linked to several tracks';
  const problem = otherProject ? ` · ${name} has a different project open` : !dawShort && trackIssue ? ` · ${trackSentence}` : '';
  const tooltip = `${detail}${problem}${unsaved ? ` · ${UNSAVED}` : ''}`;
  const aria = `Recording setup: ${name}${state}${unsaved ? `, ${UNSAVED}` : ''}`;
  // The app's own recorder has no DAW to link, so, as in the header, its chip goes straight to Recording settings.
  const destination = standalone ? 'recording-settings' : 'engine-panel';
  return (
    <EngineChipButton destination={destination} tooltip={tooltip} tone={tone} label={aria}>
      {stateWords ? `${name} · ${stateWords}` : name}
    </EngineChipButton>
  );
}
