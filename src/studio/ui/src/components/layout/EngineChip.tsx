import type { AudacityLink, DawKind } from '../../api/contracts/daw';
import { audacityTitle } from '../engine/audacityLinkText';
import { dawShortName } from '../../studio/StudioProvider';
import { statusTone, type StatusId } from '../../kinds/statusTone';
import { HeaderChip, type HeaderChipTone } from '../primitives/HeaderChip';
import { toneColors } from '../primitives/StatusBadge';
import { TooltipTarget } from '../primitives/Tooltip';

// The header's recording-engine chip (the Studio Next mock's top bar): the name of the recorder the project is connected to, with a dot
// for how it is doing. Its tooltip says whether it is running. A click opens the engine panel, which holds the link and
// relink action. 'builtin' is the project's recorder choice and, like a DAW of 'none', has no link to open.
export type EngineState = 'daw' | 'builtin';

export function EngineChip({
  daw,
  engine = 'daw',
  dawFileLinked,
  dawReachable = false,
  dawProjectMatches = false,
  audacity,
  followingChapter,
  onOpenEnginePanel,
  linkingDawFile = false,
}: {
  /** Which DAW backs the session (`dawCapabilities().daw`); undefined until the first answer, when the chip names none. */
  daw?: DawKind;
  /** Which engine backs this project; the UI defaults to 'daw' until native recording picks 'builtin'. */
  engine?: EngineState;
  dawFileLinked: boolean;
  /** Whether a live heartbeat has been seen recently; false also covers "unknown". */
  dawReachable?: boolean;
  /** Whether that heartbeat's open project is the linked file; only meaningful when dawReachable is true. */
  dawProjectMatches?: boolean;
  /** Audacity's link state. For an Audacity project the chip words it from this instead of REAPER's file link and heartbeat. */
  audacity?: AudacityLink;
  /** The chapter the DAW is following, when the host reports one. */
  followingChapter?: string;
  /** Opens the engine panel: the linked project and its link action, the tracks, chapter sync and the DAW tools. */
  onOpenEnginePanel: () => void;
  /** True while the shared DAW-link binding is running for any of its three call sites (docs/architecture/interaction-feedback.md#the-standard's ref guard). */
  linkingDawFile?: boolean;
}) {
  if (engine === 'builtin' || daw === 'none') {
    return (
      // role="group" (not a plain span): aria-label is only permitted on an element whose role supports naming, and
      // below `md` the visible text hides, leaving the dot as the chip's only content (axe aria-prohibited-attr).
      <HeaderChip role="group" aria-label="Built-in: Recording happens in the app" dot="var(--non-text)" short className="flex-none">
        <span className="max-md:hidden">Built-in</span>
      </HeaderChip>
    );
  }
  const label = daw ? dawShortName(daw) : '';
  // An Audacity project has no .rpp and no REAPER heartbeat: its link is the label in the Audacity project, and "answering" is its pipe.
  const forAudacity = daw === 'Audacity' && audacity?.chosen === true ? audacity : undefined;
  const linked = forAudacity ? forAudacity.linked : dawFileLinked;
  const reachable = forAudacity ? forAudacity.state === 'answering' : dawReachable;
  const matches = forAudacity ? forAudacity.openProject === 'linked' : dawProjectMatches;
  const mismatch = linked && reachable && !matches;
  let tooltip = !linked
    ? 'Open the engine panel to link a project file'
    : !reachable
      ? 'Not running'
      : mismatch
        ? 'A different project is open than the one linked here. Open the engine panel to link the open project, or switch to the linked file.'
        : followingChapter
          ? `Linked · following ${followingChapter}`
          : 'Linked';
  if (forAudacity && !reachable) tooltip = `${audacityTitle(forAudacity)}. Open the engine panel for the steps.`;
  if (forAudacity && reachable && !linked) tooltip = 'Audacity is answering. Open the engine panel to link the open project.';
  const status: StatusId =
    forAudacity && !reachable ? 'not_running' : !linked ? 'not_linked' : mismatch ? 'wrong_project' : !reachable ? 'not_running' : 'linked';
  const tone = statusTone(status) as HeaderChipTone;
  const dot = tone === 'neutral' ? 'var(--non-text)' : toneColors(tone).line;
  return (
    <TooltipTarget text={tooltip}>
      <HeaderChip
        tone={tone}
        dot={dot}
        onClick={onOpenEnginePanel}
        aria-busy={linkingDawFile}
        aria-label={label ? `${label}: ${tooltip}` : tooltip}
        short
        className="flex-none"
      >
        {/* Below `md` the chip shortens to its dot; the full text stays in the accessible name above. */}
        <span className="max-md:hidden">{label}</span>
      </HeaderChip>
    </TooltipTarget>
  );
}
