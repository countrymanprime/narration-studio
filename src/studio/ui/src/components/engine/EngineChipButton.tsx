import type { ReactNode } from 'react';
import { HeaderChip, type HeaderChipTone } from '../primitives/HeaderChip';
import { TooltipTarget } from '../primitives/Tooltip';
import { useOpenEnginePanel } from './EnginePanelContext';

/** What every DAW chip's tooltip ends with: where a press goes. */
export const ENGINE_CHIP_DESTINATION = 'Opens the Audio engine panel';

/**
 * The one button behind every chip that names the DAW (the header's EngineChip on every page with the header, the Booth's SetupChip): a
 * press opens the Audio engine panel, which holds the link, relink, tracks, chapter sync and the DAW tools, and offers Recording settings
 * for choosing the engine. Both chips draw this, so a chip cannot lead somewhere else (`dawChip.guard.test.tsx`). `tooltip` says how the DAW
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
}: {
  tooltip: string;
  tone: HeaderChipTone;
  dot?: string;
  /** The accessible name when the visible text is not the whole of it. */
  label?: string;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const open = useOpenEnginePanel();
  return (
    <TooltipTarget text={`${tooltip} · ${ENGINE_CHIP_DESTINATION}`}>
      <HeaderChip tone={tone} dot={dot} onClick={open} aria-busy={busy} aria-label={label} className={className}>
        {children}
      </HeaderChip>
    </TooltipTarget>
  );
}
