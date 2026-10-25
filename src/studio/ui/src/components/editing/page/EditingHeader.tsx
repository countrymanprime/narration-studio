import type { KeyboardEventHandler, ReactNode } from 'react';
import { Heading } from '../../primitives/Heading';
import { IconButton } from '../../primitives/IconButton';
import { TooltipTarget } from '../../primitives/Tooltip';
import { StripToggle } from '../strip/TimelineStrip';

export interface EditingHeaderProps {
  /** The chapter step control. */
  stepper: ReactNode;
  /** What is marked (the legend), or the "Not transcribed yet" pill; nothing while the chapter loads. */
  legend: ReactNode;
  /** The quiet marks that reopen a connection dialog (the DAW is not connected, the chapter is not linked); nothing when all is well. */
  status?: ReactNode;
  strip: { open: boolean; toggle: () => void };
  /** The strip fits beside the text: its button is offered (the button also hides itself below a 1360 px window). */
  stripFits: boolean;
  drawerOpen: boolean;
  onDrawer: () => void;
  /** Escape on the drawer's toggle while the drawer is open: closes it, focus stays on the toggle. */
  onDrawerKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}

/**
 * The page's header (the Studio Next mock's `.ph.sx-ph`): the title, the chapter step, the legend, and the two header buttons, the timeline
 * strip (S) where it fits and the clean-up and effects drawer (Ctrl+Shift+C).
 */
export function EditingHeader({ stepper, legend, status, strip, stripFits, drawerOpen, onDrawer, onDrawerKeyDown }: EditingHeaderProps) {
  return (
    <header className="@container/hd flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3 pb-2">
      <Heading title="Editing" />
      <div className="contents @max-[36rem]/hd:order-2 @max-[36rem]/hd:flex">{stepper}</div>
      <div className="min-w-0 flex-1 @max-[36rem]/hd:order-3 @max-[36rem]/hd:basis-full">{legend}</div>
      <div className="flex items-center gap-2 @max-[36rem]/hd:order-1 @max-[36rem]/hd:ml-auto">
        {status}
        {stripFits ? <StripToggle open={strip.open} onToggle={strip.toggle} /> : null}
        <TooltipTarget text="Clean up and effects (Ctrl+Shift+C)">
          <IconButton
            action="cleanUpAndEffects"
            label="Clean up and effects"
            id="drawertoggle"
            aria-pressed={drawerOpen}
            aria-keyshortcuts="Control+Shift+C"
            onClick={onDrawer}
            onKeyDown={onDrawerKeyDown}
          />
        </TooltipTarget>
      </div>
    </header>
  );
}
