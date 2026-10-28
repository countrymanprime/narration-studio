import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight, faFolder, faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import { IconButton } from '../primitives/IconButton';
import { TooltipTarget } from '../primitives/Tooltip';

// The pieces a track tree row is drawn from, shared by the Tracks table and the track picker so they cannot drift: the indent guides, the
// caret, the folder icon and the colour dot.

/** 1.25 rem of indent per level, one guide line each; 1rem on a narrow card. */
const GUIDE = 'w-4 @min-[40rem]:w-5';

/** One vertical line per level above the row, level 1 having none. */
export function IndentGuides({ level }: { level: number }) {
  return (
    <span aria-hidden="true" className="flex flex-none self-stretch">
      {Array.from({ length: level - 1 }, (_, at) => (
        <span key={at} className={`${GUIDE} border-l border-[var(--line)]`} />
      ))}
    </span>
  );
}

/**
 * The open/close caret of a folder, an icon button with a tooltip and a name. It is out of the tab order, as in the WAI-ARIA tree pattern: the row
 * is the tab stop and Left and Right do the same. A track that is not a folder gets a blank of the same width so the names line up.
 */
export function TreeCaret({ folderName, open, onToggle }: { folderName?: string; open?: boolean; onToggle?: () => void }) {
  if (folderName === undefined) return <span aria-hidden="true" className="size-7 flex-none" />;
  const label = open ? `Close ${folderName}` : `Open ${folderName}`;
  return (
    <TooltipTarget text={label}>
      <IconButton label={label} variant="ghost" size="xs" tabIndex={-1} aria-expanded={open} onClick={onToggle}>
        <FontAwesomeIcon
          icon={faChevronRight}
          className={`text-xs transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </IconButton>
    </TooltipTarget>
  );
}

/** The track's colour: a folder icon (open or closed) for a folder, a dot for a track. */
export function TrackMark({ color, folder, open }: { color: string; folder: boolean; open?: boolean }) {
  const fill = color || 'var(--non-text)';
  if (folder) return <FontAwesomeIcon icon={open ? faFolderOpen : faFolder} className="flex-none text-sm" style={{ color: fill }} aria-hidden="true" />;
  return <span className="mx-0.5 size-[10px] flex-none rounded-full" style={{ backgroundColor: fill }} aria-hidden="true" />;
}

export const tracksWord = (count: number): string => `${count} ${count === 1 ? 'track' : 'tracks'}`;
