import type { ReactNode } from 'react';
import { Heading } from '../../primitives/Heading';
import { IconButton } from '../../primitives/IconButton';
import { TooltipTarget } from '../../primitives/Tooltip';
import { StripToggle } from '../strip/TimelineStrip';

export interface EditingHeaderProps {
  /** The chapter step control. */
  stepper: ReactNode;
  /** What is marked (the legend), or the "Not transcribed yet" pill; nothing while the chapter loads. */
  legend: ReactNode;
  strip: { open: boolean; toggle: () => void };
  /** The strip fits beside the text: its button is offered (the button also hides itself below a 1360 px window). */
  stripFits: boolean;
  drawerOpen: boolean;
  onDrawer: () => void;
}

/**
 * The page's header (the Studio Next mock's `.ph.sx-ph`): the title, the chapter step, the legend, and the two header buttons, the timeline
 * strip (S) where it fits and the clean-up and effects drawer (Ctrl+Shift+C).
 */
export function EditingHeader({ stepper, legend, strip, stripFits, drawerOpen, onDrawer }: EditingHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 pb-2">
      <Heading title="Editing" />
      {stepper}
      <div className="min-w-0 flex-1">{legend}</div>
      <div className="flex items-center gap-2">
        {stripFits ? <StripToggle open={strip.open} onToggle={strip.toggle} /> : null}
        <TooltipTarget text="Clean up and effects (Ctrl+Shift+C)">
          <IconButton
            action="sidePanel"
            label="Clean up and effects"
            id="drawertoggle"
            aria-pressed={drawerOpen}
            aria-keyshortcuts="Control+Shift+C"
            onClick={onDrawer}
          />
        </TooltipTarget>
      </div>
    </header>
  );
}
