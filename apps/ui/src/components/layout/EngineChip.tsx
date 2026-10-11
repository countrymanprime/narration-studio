import type { DawKind } from '../../api/contracts/daw';
import { dawShortName } from '../../studio/StudioProvider';
import { HeaderChip } from '../primitives/HeaderChip';
import { TooltipTarget } from '../primitives/Tooltip';

// The header's recording-engine chip (the Studio Next mock's top bar): the name of the recorder the project is connected to, with a dot
// for how it is doing. Its tooltip says whether it is running. A click opens the engine panel (Phase 6), which holds the link and
// relink action. 'builtin' is the project's recorder choice (Q7) and, like a DAW of 'none', has no link to open.
export type EngineState = 'daw' | 'builtin';

export function EngineChip({
  daw,
  engine = 'daw',
  dawFileLinked,
  dawReachable = false,
  dawProjectMatches = false,
  followingChapter,
  onOpenEnginePanel,
  linkingDawFile = false,
}: {
  /** Which DAW backs the session (`dawCapabilities().daw`); undefined until the first answer, when the chip names none. */
  daw?: DawKind;
  /** Which engine backs this project (Q7); the UI defaults to 'daw' until native recording picks 'builtin'. */
  engine?: EngineState;
  dawFileLinked: boolean;
  /** Whether a live heartbeat has been seen recently (ADR 0092); false also covers "unknown". */
  dawReachable?: boolean;
  /** Whether that heartbeat's open project is the linked file; only meaningful when dawReachable is true. */
  dawProjectMatches?: boolean;
  /** The chapter the DAW is following, when the host reports one. */
  followingChapter?: string;
  /** Opens the engine panel: the linked project and its link action, the tracks, chapter sync and the DAW tools. */
  onOpenEnginePanel: () => void;
  /** True while the shared DAW-link binding is running for any of its three call sites (ADR 0075's ref guard). */
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
  const mismatch = dawFileLinked && dawReachable && !dawProjectMatches;
  const tooltip = !dawFileLinked
    ? 'Open the engine panel to link a project file'
    : !dawReachable
      ? 'Not running'
      : mismatch
        ? 'A different project is open than the one linked here. Open the engine panel to link the open project, or switch to the linked file.'
        : followingChapter
          ? `Linked · following ${followingChapter}`
          : 'Linked';
  const tone = !dawFileLinked ? 'neutral' : mismatch || !dawReachable ? 'warning' : 'success';
  const dot = tone === 'neutral' ? 'var(--non-text)' : tone === 'warning' ? 'var(--warn)' : 'var(--ok)';
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
        {/* Below `md` the chip shortens to its dot; the full text stays in the accessible name above (app-navigation Q10 A). */}
        <span className="max-md:hidden">{label}</span>
      </HeaderChip>
    </TooltipTarget>
  );
}
