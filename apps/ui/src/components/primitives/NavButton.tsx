import { useId } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, type faHouse } from '@fortawesome/free-solid-svg-icons';
import { Popover } from './Popover';
import { TooltipTarget } from './Tooltip';

// The nav item as the Studio Next mock's `.nav` draws it (ADR 0760): 40 px tall on a 42 px pitch (the rail's group puts 2 px between items),
// radius 8 (6 on the right for the current page), the label Barlow Condensed 600 at 15 px tracked 0.12em in capitals, a 20 px icon in a fixed 22 px box (`!`: FontAwesome's `fa-fw` sets 1.25em), 10 px from the label.
// The current page is the mock's default "bar" highlight (`html[data-hl="bar"] .nav[aria-current="page"]`): `--surface-2` (the mock's `--raised`)
// with the label in `--text` and a 3 px `--accent` bar down its left edge, square on the left and 6 px round on the right. The icon-only rail (`medium-rail`) keeps its 40 px square items and 16 px icons.
const ITEM =
  "relative flex h-10 w-full items-center gap-[0.625rem] border-0 pr-3 pl-[0.625rem] text-left font-['Barlow_Condensed',sans-serif] text-[0.9375rem] font-semibold tracking-[0.12em] uppercase [&_svg]:w-[1.375rem]! [&_svg]:flex-none [&_svg]:text-[1.25rem] [.medium-rail_&]:h-10 [.medium-rail_&]:justify-center [.medium-rail_&]:p-0 [.medium-rail_&_svg]:text-base";

const ROUND = 'rounded-lg';
const CURRENT = 'rounded-[0_6px_6px_0] bg-[var(--surface-2)] text-[var(--text)] shadow-[inset_3px_0_0_var(--accent)]';
const HOVER = 'hover:bg-[var(--surface-2)] hover:text-[var(--text)]';

export function NavButton({
  active,
  icon,
  children,
  onClick,
  iconOnly = false,
  disabled = false,
  disabledReason,
  count,
}: {
  active: boolean;
  icon: typeof faHouse;
  children: string;
  onClick: () => void;
  iconOnly?: boolean;
  /** Off, not removed: the button stays focusable with `aria-disabled`, keeps its name, never runs `onClick`, and a press opens a note with `disabledReason`. */
  disabled?: boolean;
  /** What unlocks the page: the item's description, its hint on hover and focus, and the text of the note a press opens. */
  disabledReason?: string;
  /** How many items wait on the page (mock 01's "14" beside Proof), drawn at the item's end; nothing passes one until a
   * page's count has data behind it (visual audit SH5). The wide rail only: the icon rail has no room for it. */
  count?: number;
}) {
  const showCount = !iconOnly && count !== undefined && count > 0;
  const reasonId = useId();
  const off = disabled;
  // An off item keeps the rail's muted text at full strength (it can take focus, so it meets AA); a lock and the lack of a hover fill set it apart.
  const look = active ? CURRENT : off ? `${ROUND} cursor-default text-[var(--text-muted)]` : `${ROUND} text-[var(--text-muted)] ${HOVER}`;
  const button = (
    <button
      className={`${ITEM} ${look}`}
      onClick={off ? undefined : onClick}
      aria-disabled={off || undefined}
      aria-describedby={off && disabledReason ? reasonId : undefined}
      aria-label={iconOnly ? children : showCount ? `${children}, ${count}` : undefined}
      aria-current={active ? 'page' : undefined}
    >
      <FontAwesomeIcon icon={icon} fixedWidth />
      {!iconOnly && children}
      {/* The count pill, measured on mock 01: 16 px tall, fully rounded, `--surface-2` in `--text-muted`, also on the current page
          (the bar's own `--surface-2`, as in the mock, where `.ct` and the bar are both `--raised`), Barlow Condensed 600 at 11 px, its right edge 12 px inside the item. */}
      {showCount && (
        <span
          aria-hidden="true"
          className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--surface-2)] px-[0.3125rem] text-[length:var(--font-size-label)] tracking-normal text-[var(--text-muted)]"
        >
          {count}
        </span>
      )}
      {off && !iconOnly && (
        <span aria-hidden="true" data-nav-lock className="ml-auto inline-flex text-[0.6875rem] text-[var(--text-muted)]">
          <FontAwesomeIcon icon={faLock} />
        </span>
      )}
    </button>
  );
  if (off) {
    // The hint shows the reason on hover and keyboard focus; a press opens the note, which also works on touch and in the drawer, where no hint opens.
    return (
      <TooltipTarget text={disabledReason || children} className="w-full">
        <Popover trigger={button} label={`${children} is unavailable`} side="right" align="start">
          <p className="m-0 text-sm text-[var(--text)]">{disabledReason}</p>
        </Popover>
        {/* Outside the button: inside it, the reason would become part of the item's name. Clipped, not `sr-only`: that is absolutely
            positioned, and the rail is `display: none` below `md`, where an absolute child has no offset parent (the visual suite's escaped-block guard). */}
        {disabledReason && (
          <span id={reasonId} className="-mr-px size-px flex-none overflow-hidden whitespace-nowrap [clip-path:inset(50%)]">
            {disabledReason}
          </span>
        )}
      </TooltipTarget>
    );
  }
  return iconOnly ? (
    <TooltipTarget text={children} className="[.medium-rail_&]:w-full">
      {button}
    </TooltipTarget>
  ) : (
    button
  );
}
