import type { AudacityLink, DawKind } from '../../api/contracts/daw';
import { audacityTitle } from '../engine/audacityLinkText';
import { dawShortName } from '../../studio/StudioProvider';
import { statusTone, type StatusId } from '../../kinds/statusTone';
import type { HeaderChipTone } from '../primitives/HeaderChip';
import { EngineChipButton } from '../engine/EngineChipButton';
import { toneColors } from '../primitives/StatusBadge';

// The header's recording-engine chip (the research mock's top bar): the name of the recorder the project is connected to, with a dot
// for how it is doing. A state that needs the narrator also says so in words ("REAPER: Other project"), so the states do not differ by
// colour alone, and below `md` the chip keeps a word rather than shrinking to a bare dot (alignment audit R3SL-2, R3PR1-9, XSL-12).
// Its tooltip says more and ends with where a press goes: every DAW chip, this one and the Booth's, is an `EngineChipButton`, which opens the Audio engine panel. 'builtin' is the project's recorder choice and, like a DAW of 'none', has no link to open.
export type EngineState = 'daw' | 'builtin';

// The word a state that needs the narrator draws after the DAW's name; a linked DAW draws its name alone, as the mock's chip does.
const STATE_WORD: Partial<Record<StatusId, string>> = { not_linked: 'Not linked', not_running: 'Not running', wrong_project: 'Other project' };

export function EngineChip({
  daw,
  engine = 'daw',
  dawFileLinked,
  dawReachable = false,
  dawProjectMatches = false,
  audacity,
  followingChapter,
  linkingDawFile = false,
}: {
  /** Which DAW backs the session (the capability report's `daw`); undefined until the first answer, when the chip names none. */
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
  /** True while the shared DAW-link binding is running for any of its three call sites (docs/architecture/interaction-feedback.md#the-standard's ref guard). */
  linkingDawFile?: boolean;
}) {
  if (engine === 'builtin' || daw === 'none') {
    // The app's own recorder has no DAW to link, so its chip goes straight to where the engine is chosen. aria-label: the visible text hides
    // below `md`, leaving the dot as the chip's only content.
    return (
      <EngineChipButton
        destination="recording-settings"
        tooltip="Recording happens in the app"
        tone="neutral"
        dot="var(--non-text)"
        label="Built-in: Recording happens in the app"
        className="flex-none"
      >
        Built-in
      </EngineChipButton>
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
    ? 'No project file is linked'
    : !reachable
      ? 'Not running'
      : mismatch
        ? 'A different project is open than the one linked here. Link the open project, or switch to the linked file.'
        : followingChapter
          ? `Linked · following ${followingChapter}`
          : 'Linked';
  if (forAudacity && !reachable) tooltip = `${audacityTitle(forAudacity)}. The panel has the steps.`;
  if (forAudacity && reachable && !linked) tooltip = 'Audacity is answering. Link the open project.';
  const status: StatusId =
    forAudacity && !reachable ? 'not_running' : !linked ? 'not_linked' : mismatch ? 'wrong_project' : !reachable ? 'not_running' : 'linked';
  const tone = statusTone(status) as HeaderChipTone;
  const word = STATE_WORD[status];
  // The words drawn come first in the name: axe fails a name that does not contain the text the button draws.
  const drawn = [label, word].filter(Boolean).join(': ');
  const dot = tone === 'neutral' ? 'var(--non-text)' : toneColors(tone).line;
  return (
    <EngineChipButton
      tooltip={tooltip}
      tone={tone}
      dot={dot}
      busy={linkingDawFile}
      label={!word ? (label ? `${label}: ${tooltip}` : tooltip) : tooltip === word ? drawn : `${drawn}. ${tooltip}`}
      className="flex-none"
    >
      {/* Below `md` a state word stands alone ("Other project"); the DAW's name stays in the accessible name above. */}
      {/* One flex item, so the chip's gap does not open a second space after the colon. */}
      {word ? (
        <span>
          {label && <span className="max-md:hidden">{label}: </span>}
          {word}
        </span>
      ) : (
        label
      )}
    </EngineChipButton>
  );
}
