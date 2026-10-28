import { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faAnglesDown, faAnglesUp, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { IconButton } from '../primitives/IconButton';
import { Panel } from '../primitives/Panel';
import { SearchField } from '../primitives/SearchField';
import { StatusBadge } from '../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { TooltipTarget } from '../primitives/Tooltip';
import { treeKeyHandler } from '../primitives/treeKeys';
import { IndentGuides, TREE_INDENT, TrackMark, TreeCaret, tracksWord } from '../tracks/TreeRowParts';
import { buildTrackTree, defaultOpen, folderRollup, searchVisible, trackLabel, visibleNodes } from '../tracks/trackTree';
import type { Track, TrackMapping } from '../../types';

/** The Tracks card's list height: it scrolls inside itself under a header that stays put, and the page does not (rule 6). */
const LIST_CAP = 'max-h-[min(70vh,560px)] overflow-auto overscroll-contain';

// The project's tracks with the chapter each one is linked to, REAPER's folders drawn as an indented tree. Read-only: a link is made or
// changed in Chapter links, or by chapter sync. A folder's Chapter cell rolls up how many of the tracks below it are linked, so a link inside a
// closed folder is still found. The folders start open up to 30 tracks and, above that, open only on the way to a linked track; the state is
// not saved. A project with no folders draws as the flat table it always was.
export function TrackList({ tracks, mappings }: { tracks: Track[]; mappings: TrackMapping[] }) {
  const nodes = useMemo(() => buildTrackTree(tracks), [tracks]);
  const linked = useMemo(() => new Set(mappings.map((mapping) => mapping.trackGuid)), [mappings]);
  const titlesFor = (guid: string) => mappings.filter((mapping) => mapping.trackGuid === guid).map((mapping) => mapping.chapterTitle);
  const hasFolders = nodes.some((node) => node.track.isFolder);
  // The narrator's choices over the default; the default is read again when the project's tracks change.
  const [opened, setOpened] = useState<{ source: Track[]; open: Set<string> }>();
  const open = opened?.source === tracks ? opened.open : defaultOpen(nodes, linked);
  const setOpen = (next: Set<string>) => setOpened({ source: tracks, open: next });
  const toggle = (id: string, wanted: boolean) => {
    const next = new Set(open);
    if (wanted) next.add(id);
    else next.delete(id);
    setOpen(next);
  };
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  // A search shows every match with the folders above it open, whatever the narrator closed.
  const rows = searching ? searchVisible(nodes, query).rows : visibleNodes(nodes, open);
  const [active, setActive] = useState('');
  const tabStop = rows.some((row) => row.id === active) ? active : (rows[0]?.id ?? '');
  const folderIds = nodes.filter((node) => node.track.isFolder).map((node) => node.id);

  return (
    <Panel
      title="Tracks"
      flush
      actions={
        hasFolders ? (
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            <span className="w-44 max-w-full">
              <SearchField label="Search tracks" placeholder="Search tracks" value={query} onChange={setQuery} leadingIcon />
            </span>
            <TooltipTarget text="Open all folders">
              <IconButton label="Open all folders" size="sm" onClick={() => setOpen(new Set(folderIds))}>
                <FontAwesomeIcon icon={faAnglesDown} aria-hidden="true" />
              </IconButton>
            </TooltipTarget>
            <TooltipTarget text="Close all folders">
              <IconButton label="Close all folders" size="sm" onClick={() => setOpen(new Set())}>
                <FontAwesomeIcon icon={faAnglesUp} aria-hidden="true" />
              </IconButton>
            </TooltipTarget>
          </span>
        ) : undefined
      }
    >
      <div className="@container">
        <div className={`${TREE_INDENT} ${LIST_CAP}`}>
          <Table label="Tracks" tree={hasFolders}>
            <TableHead sticky>
              <TableRow>
                <TableHeader>Track</TableHeader>
                <TableHeader>Chapter</TableHeader>
                <TableHeader align="right">Playable items</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody
              onKeyDown={hasFolders ? treeKeyHandler(toggle) : undefined}
              onFocus={(event) => {
                const id = (event.target as HTMLElement).closest<HTMLElement>('[data-tree-row]')?.dataset.treeRow;
                if (id) setActive(id);
              }}
            >
              {rows.map((node) => {
                const { track } = node;
                const at = nodes.indexOf(node);
                const playable = track.items.filter((item) => item.supported && item.sourceAvailable).length;
                const hasIssue = track.items.some((item) => !item.supported || !item.sourceAvailable);
                const chapterTitles = titlesFor(track.guid);
                const isOpen = searching ? track.isFolder : open.has(node.id);
                const rollup = track.isFolder ? folderRollup(nodes, at, linked) : undefined;
                const name = trackLabel(track);
                const row = (children: React.ReactNode) =>
                  hasFolders ? (
                    <TableRow
                      key={node.id}
                      tree={{
                        id: node.id,
                        level: node.level,
                        posInSet: node.posInSet,
                        setSize: node.setSize,
                        expanded: track.isFolder ? isOpen : undefined,
                        active: node.id === tabStop,
                      }}
                    >
                      {children}
                    </TableRow>
                  ) : (
                    <TableRow key={node.id}>{children}</TableRow>
                  );
                return row(
                  <>
                    <TableCell className="relative">
                      {hasFolders && <IndentGuides level={node.level} fill />}
                      <span className="flex min-w-0 items-center gap-1.5" style={{ marginLeft: `calc(var(--g) * ${hasFolders ? node.level - 1 : 0})` }}>
                        {hasFolders && <TreeCaret folderName={track.isFolder ? name : undefined} open={isOpen} onToggle={() => toggle(node.id, !isOpen)} />}
                        <TrackMark color={track.color} folder={track.isFolder} open={isOpen} />
                        <span className={`min-w-0 [overflow-wrap:anywhere] ${track.isFolder ? 'font-semibold' : 'font-medium'}`}>{name}</span>
                        {track.isFolder && (
                          <span className="@max-[40rem]:hidden">
                            <StatusBadge tone="neutral" label={node.childCount === 0 ? 'Empty' : tracksWord(node.childCount)} />
                          </span>
                        )}
                        {track.muted && <StatusBadge tone="neutral" label="Muted" />}
                      </span>
                    </TableCell>
                    <TableCell style={{ color: rollup || chapterTitles.length === 0 ? 'var(--text-muted)' : undefined }}>
                      {rollup ? (
                        rollup.total === 0 ? (
                          'No tracks inside'
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {rollup.linked > 0 && <span className="size-[7px] flex-none rounded-full bg-[var(--ok)]" aria-hidden="true" />}
                            {rollup.linked} of {rollup.total} linked
                          </span>
                        )
                      ) : chapterTitles.length > 0 ? (
                        chapterTitles.join(', ')
                      ) : (
                        'Not linked'
                      )}
                    </TableCell>
                    <TableCell numeric>
                      {track.isFolder && track.items.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)' }} aria-label="No audio of its own">
                          —
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          {hasIssue && (
                            <span title="This track has an item that can't be played" style={{ color: 'var(--danger-text)' }}>
                              <FontAwesomeIcon icon={faTriangleExclamation} aria-label="This track has an item that can't be played" />
                            </span>
                          )}
                          {playable}/{track.items.length}
                        </span>
                      )}
                    </TableCell>
                  </>,
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center" muted>
                    No track matches &ldquo;{query.trim()}&rdquo;
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Panel>
  );
}
