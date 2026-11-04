import { Icon } from '../primitives/Icon';

// The pieces only a track row has, shared by the Tracks table and the track picker so they cannot drift: the folder icon and the colour dot.
// The indent guides and the caret every tree row has are the `TreeCaret` primitive's.

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
