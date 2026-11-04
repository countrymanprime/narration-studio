import type { ReactNode } from 'react';
import { HeaderChip, type HeaderChipTone } from '../primitives/HeaderChip';
import { TooltipTarget } from '../primitives/Tooltip';
import { useOpenEnginePanel, useOpenRecordingSettings } from './EnginePanelContext';

/** What every DAW chip's tooltip ends with: where a press goes. */
const ENGINE_CHIP_DESTINATION = 'Opens the Audio engine panel';
/** The Built-in chips' tooltip ending: the app's own recorder has no link to manage, so its chip goes to where the engine is chosen. */
const BUILTIN_CHIP_DESTINATION = 'Opens Recording settings';

/**
 * The one button behind every chip that names the recorder (the header's EngineChip on every page with the header, the Booth's SetupChip): a
 * press on a DAW's chip opens the Audio engine panel, which holds the link, relink, tracks, chapter sync and the DAW tools, and offers Recording settings
 * for choosing the engine; the Built-in chip, with no DAW to link, opens Recording settings itself. Both chips draw this, so a chip cannot lead somewhere else (`dawChip.guard.test.tsx`). `tooltip` says how the DAW
 * stands; the destination is added here.
 */
export function EngineChipButton({
  tooltip,
  tone,
  dot,
  label,
  busy,
  className,
  children,
  destination = 'engine-panel',
}: {
  /** `engine-panel` for a DAW chip; `recording-settings` for the Built-in chip, which has no DAW link to manage. */
  destination?: 'engine-panel' | 'recording-settings';
  tooltip: string;
  tone: HeaderChipTone;
  dot?: string;
  /** The accessible name when the visible text is not the whole of it. */
  label?: string;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const openPanel = useOpenEnginePanel();
  const openSettings = useOpenRecordingSettings();
  const open = destination === 'engine-panel' ? openPanel : openSettings;
  return (
    <TooltipTarget text={`${tooltip} · ${destination === 'engine-panel' ? ENGINE_CHIP_DESTINATION : BUILTIN_CHIP_DESTINATION}`}>
      <HeaderChip tone={tone} dot={dot} onClick={open} aria-busy={busy} aria-label={label} className={className}>
        {children}
      </HeaderChip>
    </TooltipTarget>
  );
}
