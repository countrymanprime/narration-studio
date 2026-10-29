import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { TooltipTarget } from '../primitives/Tooltip';

// The pieces a track tree row is drawn from, shared by the Tracks table and the track picker so they cannot drift: the indent guides, the
// caret, the folder icon and the colour dot.

/** The indent of one level, 1 rem on a narrow card and 1.25 rem on a wide one; a card sets `--g` (`TREE_INDENT`) and the guides and rows read it. */
export const TREE_INDENT = '[--g:1rem] @min-[40rem]:[--g:1.25rem]';

/**
 * One vertical line per level above the row, level 1 having none. In a table cell (`fill`) the lines run the cell's whole height, from the cell's
 * edge, so they join between rows; in a list row they sit inline.
 */
export function IndentGuides({ level, fill = false }: { level: number; fill?: boolean }) {
  return (
    <span aria-hidden="true" className={fill ? 'pointer-events-none absolute inset-y-0 left-4 flex' : 'flex flex-none self-stretch'}>
      {Array.from({ length: level - 1 }, (_, at) => (
        <span key={at} className="w-[var(--g,1rem)] border-l border-[var(--border)]" />
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
        <span className={`inline-flex text-xs motion-ok:transition-transform motion-ok:duration-(--motion-fast) ${open ? 'rotate-90' : ''}`}>
          <Icon name="folderCaret" />
        </span>
      </IconButton>
    </TooltipTarget>
  );
}

/** The track's colour: a folder icon (open or closed) for a folder, a dot for a track. */
export function TrackMark({ color, folder, open }: { color: string; folder: boolean; open?: boolean }) {
  const fill = color || 'var(--non-text)';
  if (folder)
    return (
      <span className="flex-none text-sm" style={{ color: fill }}>
        <Icon name={open ? 'trackFolderOpen' : 'trackFolder'} />
      </span>
    );
  return <span className="mx-0.5 size-[10px] flex-none rounded-full" style={{ backgroundColor: fill }} aria-hidden="true" />;
}

export const tracksWord = (count: number): string => `${count} ${count === 1 ? 'track' : 'tracks'}`;
