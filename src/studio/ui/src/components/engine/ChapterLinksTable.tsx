import { headingName } from '../../chapterHeading';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chapterName } from '../../chapterName';
import { EditingCheckPanel } from '../editing/EditingCheckPanel';
import { plainTrackChoices } from '../mapping/trackChoices';
import { TrackSelect } from '../mapping/TrackSelect';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Menu, type MenuItem } from '../primitives/Menu';
import { Panel } from '../primitives/Panel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { StatusBadge, type StatusTone } from '../primitives/StatusBadge';
import type { Notify } from '../primitives/Toast';
import type { ChapterLinkState, ChapterTrackRow } from './chapterTrackRows';
import type { ChapterLinks } from './useChapterLinks';
import type { ManuscriptChapter, Track, TrackMapping } from '../../types';
import { addressPath } from '../../navigation/address';

const STATE_BADGE: Record<ChapterLinkState, { label: string; tone: StatusTone }> = {
  linked: { label: 'Linked', tone: 'success' },
  unlinked: { label: 'Not linked', tone: 'neutral' },
  missing_track: { label: 'Track missing', tone: 'danger' },
};

// One grid for every row in every state (alignment audit ENX-1): the chapter takes what is left, then the status badge, the track (its
// name, or the picker) and the row's actions at fixed widths, so a link, a Change or a missing track never moves a column. The actions
// column holds the widest pair (Confirm and Cancel) and the More actions button on one line.
const COLUMNS = ['auto', '6.75rem', '10.5rem', '12.5rem'] as const;

// Below this width (the panel at a phone width or 400% zoom) a row is two lines instead: the chapter and its status, then the track
// and the actions (ENX-29). `NARROW` is the container query the cells use.
const NARROW_TABLE =
  '@max-[34rem]:block @max-[34rem]:[&>colgroup]:hidden @max-[34rem]:[&>thead]:hidden @max-[34rem]:[&>tbody]:block @max-[34rem]:[&_td]:h-auto @max-[34rem]:[&_td]:border-b-0 @max-[34rem]:[&_td]:px-0! @max-[34rem]:[&_td]:py-1';
const NARROW_ROW =
  '@max-[34rem]:grid @max-[34rem]:grid-cols-[minmax(0,1fr)_auto] @max-[34rem]:items-center @max-[34rem]:gap-x-3 @max-[34rem]:border-b @max-[34rem]:border-[var(--border)] @max-[34rem]:px-4 @max-[34rem]:py-2 @max-[34rem]:last:border-b-0';

// The audio engine panel's list of every chapter-track link (the "whole
// picture" list lives here, beside the per-chapter inline prompt used wherever a check needs it). It shows every
// narration chapter whether or not it has a confirmed link, so an unlinked chapter and a link pointing at a track
// that no longer exists are both visible in one place, not just the one chapter a narrator happens to be checking.
// It draws from `links`, the one reader of the mapping that the Link chapters dialog and the Tracks card above share (R3EN1-7).
export function ChapterLinksTable({ links, notify }: { links: ChapterLinks; notify: Notify }) {
  const { tracks, chapters, mappings, rows, error, busyChapterId } = links;
  const [editingChecking, setEditingChecking] = useState<ManuscriptChapter>();
  // Nothing to link before a manuscript is imported: the mapping is scoped to a document.
  if (chapters.length === 0) return null;

  return (
    <Panel title="Chapter links" flush>
      {error && (
        <p role="alert" className="px-4 pt-3 text-sm" style={{ color: 'var(--danger-text)' }}>
          {error}
        </p>
      )}
      <div className="@container">
        <Table label="Chapter links" columns={COLUMNS} className={NARROW_TABLE}>
          <TableHead>
            <TableRow>
              <TableHeader>Chapter</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Track</TableHeader>
              <TableHeader hiddenLabel="Actions" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <ChapterLinkRow
                key={row.chapter.id}
                row={row}
                tracks={tracks}
                mappings={mappings}
                busy={busyChapterId === row.chapter.id}
                onConfirm={(trackGuid) => links.set(row.chapter.id, trackGuid)}
                onClear={() => links.unlink(row.chapter.id)}
                onEditingCheck={() => setEditingChecking(row.chapter)}
              />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} style={{ color: 'var(--text-muted)' }}>
                  No chapters to link yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {editingChecking && (
        <EditingCheckPanel
          key={editingChecking.id}
          chapter={editingChecking}
          notify={notify}
          close={() => setEditingChecking(undefined)}
          size="wide"
          onBack={() => setEditingChecking(undefined)}
          backLabel="Back to the audio engine"
        />
      )}
    </Panel>
  );
}

// One chapter's row. It owns only the pending pick, as MappingConfirm does: the confirmed link is the table's, re-read after each call.
// The select opens on "Choose a track" and Confirm waits for a pick (R3EN2-1); Open in Editing, Open in Proof and Editing check sit in
// the row's More actions menu so the row keeps one line of controls (ENX-3, ENX-5).
function ChapterLinkRow({
  row,
  tracks,
  mappings,
  busy,
  onConfirm,
  onClear,
  onEditingCheck,
}: {
  row: ChapterTrackRow;
  tracks: Track[];
  mappings: TrackMapping[];
  busy: boolean;
  onConfirm: (trackGuid: string) => void;
  onClear: () => void;
  onEditingCheck: () => void;
}) {
  const navigate = useNavigate();
  const linkedGuid = row.mapping?.trackGuid;
  const hasLink = Boolean(linkedGuid);
  const [picking, setPicking] = useState(!hasLink);
  const [chosen, setChosen] = useState(linkedGuid && tracks.some((track) => track.guid === linkedGuid) ? linkedGuid : '');
  // A confirm or clear comes back as a new link from the table's read: drop back to the read view, as MappingConfirm does.
  useEffect(() => {
    setPicking(!hasLink);
  }, [hasLink, linkedGuid]);

  const name = headingName(row.chapter);
  const short = chapterName(row.chapter, 'short');
  const choices = plainTrackChoices(tracks, mappings, row.chapter.id);
  const badge = STATE_BADGE[row.state];
  const showPicker = picking && choices.length > 0;
  const menu: MenuItem[] = [
    // Editing is where a linked chapter is heard and edited; Proof's chapter view keeps its compare run and stage panels.
    ...(row.state === 'linked'
      ? [
          { key: 'editing', label: 'Open in Editing', onSelect: () => navigate(addressPath({ page: 'editing', chapter: row.chapter.id })) },
          { key: 'proof', label: 'Open in Proof', onSelect: () => navigate(`/proof/${encodeURIComponent(row.chapter.id)}`) },
        ]
      : []),
    { key: 'editing-check', label: 'Editing check…', onSelect: onEditingCheck },
  ];

  return (
    <TableRow className={NARROW_ROW}>
      <TableCell className="font-medium">
        <span className="line-clamp-2 leading-[1.125rem]" title={name}>
          {name}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <StatusBadge tone={badge.tone} label={badge.label} />
      </TableCell>
      <TableCell>
        {showPicker ? (
          <TrackSelect label={`Track for ${short}`} choices={choices} value={chosen} onChange={setChosen} fullWidth />
        ) : picking ? (
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No REAPER tracks to link
          </span>
        ) : row.trackName ? (
          <span className="block truncate" title={row.trackName}>
            {row.trackName}
          </span>
        ) : (
          <span className="line-clamp-2 leading-[1.125rem]" style={{ color: 'var(--danger-text)' }}>
            Linked track is missing from this project
          </span>
        )}
      </TableCell>
      <TableCell align="right">
        <span className="flex items-center justify-end gap-2 whitespace-nowrap">
          {showPicker ? (
            <>
              <Button variant={chosen ? 'primary' : 'secondary'} disabled={!chosen} pending={busy} onClick={() => onConfirm(chosen)}>
                Confirm
              </Button>
              {hasLink && (
                <Button variant="secondary" disabled={busy} onClick={() => setPicking(false)}>
                  Cancel
                </Button>
              )}
            </>
          ) : hasLink ? (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setPicking(true)}>
                Change
              </Button>
              <Button variant="secondary" pending={busy} onClick={onClear}>
                Clear
              </Button>
            </>
          ) : null}
          <Menu render={<IconButton action="moreActions" label={`More actions for ${short}`} />} items={menu}>
            {null}
          </Menu>
        </span>
      </TableCell>
    </TableRow>
  );
}
