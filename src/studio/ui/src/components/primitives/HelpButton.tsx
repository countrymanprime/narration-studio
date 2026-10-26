import { HIT_AREA } from './hitArea';
import { Popover } from './Popover';

/**
 * A "?" that opens a short note in a popover: where details live that would otherwise be a paragraph in the page
 * ([No in-flow instructions](../../../../../../docs/design/design-system.md#no-in-flow-instructions)). A press opens it, focus moves in,
 * Escape closes it and returns focus to the "?". Unlike `Tooltip` (a hint of a few words on hover), the note may be a few sentences, and it
 * takes no room in the page whether it is open or not. `label` names the button ("About Words per page") and the note.
 */
export function HelpButton({ label, children }: { label: string; children: string }) {
  return (
    <Popover
      label={label}
      compact
      align="start"
      sideOffset={8}
      // A Settings row's "?" scrolls with the page, and a short or shrinking window can leave it off screen with the note open: the note stays in
      // the window, clamped to its gutters and scrolling inside itself, rather than following the "?" off screen.
      fitToWindow
      trigger={
        <button
          type="button"
          aria-label={label}
          data-help-button
          className={`inline-flex size-[15px] flex-none cursor-help items-center justify-center rounded-full border border-[var(--non-text)] font-['IBM_Plex_Mono',monospace] text-[0.68rem] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] ${HIT_AREA}`}
        >
          ?
        </button>
      }
    >
      <p className="m-0 text-[0.8125rem]">{children}</p>
    </Popover>
  );
}
