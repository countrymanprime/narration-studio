import { headingName } from '../../chapterHeading';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chapterName } from '../../chapterName';
import { EditingCheckPanel } from '../editing/EditingCheckPanel';
import { plainTrackChoices } from '../mapping/trackChoices';
import { TrackSelect } from '../mapping/TrackSelect';
import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { Menu, type MenuItem } from '../primitives/Menu';
import { TooltipTarget } from '../primitives/Tooltip';
import { Panel } from '../primitives/Panel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { StatusBadge, type StatusTone } from '../primitives/StatusBadge';
import type { Notify } from '../primitives/Toast';
import type { ChapterLinkState, ChapterTrackRow } from './chapterTrackRows';
import { CREATE_QUIET_MS, type ChapterLinks } from './useChapterLinks';
import type { ManuscriptChapter, Track, TrackMapping } from '../../types';
import { addressPath } from '../../navigation/address';
import { apiErrorMessage } from '../../api/errorMessage';
import type { ChapterTrackCreateResult } from '../../api/contracts/chapterTrackMap';
import { useVoiceLayout } from './voiceLayout';
import { LiveTracksRefresh, LiveTracksStatus } from './LiveTracksStatus';
import type { LiveTracks } from './useLiveTracks';
import { folderChildren, folderLinkLabel } from './voices';
import { NestedChaptersNotice } from './NestedChaptersNotice';
import { linksKey, useChapterFolders } from './useChapterFolders';

/** The warning on a linked track whose audio cannot play (the removed Tracks card's per-track flag, kept where the link is made). */
export const UNPLAYABLE = "This track has an item that can't be played";

const STATE_BADGE: Record<ChapterLinkState, { label: string; tone: StatusTone }> = {
  linked: { label: 'Linked', tone: 'success' },
  unlinked: { label: 'Not linked', tone: 'neutral' },
  missing_track: { label: 'Track missing', tone: 'danger' },
};

// One grid for every row in every state (alignment audit ENX-1): the chapter takes what is left, then the status badge, the track (its
// name, or the picker) and the row's actions at fixed widths, so a link, a Change or a missing track never moves a column. The actions
// column holds the widest pair (the check and Cancel) and the More actions button on one line.
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
// It draws from `links`, the one reader of the mapping that the Link chapters dialog and the panel share (R3EN1-7). With `live` (a
// REAPER project) its header says whose tracks these are and when they were read, with the Refresh that reads them again (#2840).
// A chapter with no link has a create button: the DAW adds a track named after it (a folder holding a Narrator track with Voice folders,
// as the host decides at the press) and the chapter is linked to it. A refusal or a failure is a toast and leaves the row as it was; on
// success the row shows the link at once, a toast says what was made, and the live track list is read again so it lists it.
export function ChapterLinksTable({ links, notify, live }: { links: ChapterLinks; notify: Notify; live?: LiveTracks }) {
  const { tracks, chapters, mappings, rows, error, busyChapterId, creatingChapterId } = links;
  const [editingChecking, setEditingChecking] = useState<ManuscriptChapter>();
  const folders = useVoiceLayout() === 'folders';
  // Checked again whenever a link changes: a chapter linked to a track inside another chapter's folder is the case it reports (#2838).
  const nesting = useChapterFolders({ revision: linksKey(mappings), notify });
  // A pick here that takes a track from another chapter says so (links.notice), as a toast: the dialog draws its own copy of the notice, so
  // only a pick made from this table raises one (#3053).
  const pickedHere = useRef(false);
  useEffect(() => {
    if (links.notice && pickedHere.current) notify(links.notice, 'info');
  }, [links.notice, notify]);
  // The change ends after its notice is set, so the flag drops then, whether or not it displaced a chapter.
  useEffect(() => {
    if (!busyChapterId) pickedHere.current = false;
  }, [busyChapterId]);
  // Nothing to link before a manuscript is imported: the mapping is scoped to a document.
  if (chapters.length === 0) return null;

  const create = (chapter: ManuscriptChapter) => {
    links.create(chapter.id).then(
      (result) => {
        if (!result) return;
        if (result.outcome === 'refused') {
          notify(result.message, 'error');
          // The DAW added the track but its link was not saved: read the tracks so it can be picked.
          if (result.reason === 'link_failed') live?.refresh();
          return;
        }
        live?.refresh();
        notify(createdSentence(result, chapterName(chapter, 'short')), 'info');
      },
      (reason: unknown) => notify(`The track could not be added: ${apiErrorMessage(reason)}`, 'error'),
    );
  };

  // The check on the link the chapter already has: the shared state reads the tracks and the links again, then this says what that found, so
  // the press is never silent and doubles as the resync after a track was renamed in the DAW (#3275). Answers what the row does next: 'found'
  // closes the picker, 'gone' leaves it open with nothing picked, and 'failed' leaves it as it is (the failed read has its own toast).
  const recheck = async (row: ChapterTrackRow): Promise<'found' | 'gone' | 'failed'> => {
    const short = chapterName(row.chapter, 'short');
    const guid = row.mapping?.trackGuid;
    const read = live ? await live.recheck() : { failed: false };
    if (read.failed) return 'failed'; // a read failed and its own toast says so
    const now = read.project?.tracks ?? tracks;
    notify(recheckSentence(short, row.trackName, now, guid, folders), 'info');
    return now.some((candidate) => candidate.guid === guid) ? 'found' : 'gone';
  };

  return (
    <Panel
      title="Chapter links"
      flush
      subtitle={live && <LiveTracksStatus live={live} />}
      actions={
        <span className="flex items-center gap-2">
          <NestedChaptersNotice check={nesting.check} repairing={nesting.repairing} onRepair={nesting.repair} onCheckAgain={nesting.recheck} />
          {live && <LiveTracksRefresh live={live} />}
        </span>
      }
    >
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
              <TableHeader>{folders ? 'Folder' : 'Track'}</TableHeader>
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
                creating={creatingChapterId === row.chapter.id}
                createLocked={creatingChapterId !== '' && creatingChapterId !== row.chapter.id}
                onCreate={() => create(row.chapter)}
                onConfirm={(trackGuid) => {
                  // set() ignores the pair already linked, so no change ends and clears the flag: it is raised only for a real change.
                  pickedHere.current = !mappings.some((mapping) => mapping.chapterId === row.chapter.id && mapping.trackGuid === trackGuid);
                  links.set(row.chapter.id, trackGuid);
                }}
                onRecheck={() => recheck(row)}
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

/** What a Confirm on an unchanged link found: the track as it is now, what a folder holds, and whether its name moved. */
export function recheckSentence(short: string, was: string | undefined, tracks: Track[], guid: string | undefined, voiceFolders = false): string {
  const found = tracks.find((candidate) => candidate.guid === guid);
  if (!found) return `${short} is linked to a track that is no longer in the project. Choose another track or clear the link.`;
  const inside = found.isFolder ? folderChildren(tracks, found.guid).length : 0;
  const unit = voiceFolders ? ['voice', 'voices'] : ['track', 'tracks'];
  const what = found.isFolder ? `a folder with ${inside} ${inside === 1 ? unit[0] : unit[1]}` : 'a single track';
  if (was !== undefined && was !== found.name) return `The track for ${short} was renamed from “${was}” to “${found.name}” (${what}).`;
  return `${short} is linked to “${found.name}” (${what}). Nothing changed.`;
}

/** The done toast: what the DAW made, named as it was given, and that it is not saved yet. */
function createdSentence(result: Extract<ChapterTrackCreateResult, { outcome: 'created' }>, short: string): string {
  return result.voice
    ? `Created the folder “${result.track.name}” with a ${result.voice.name} track and linked ${short} to it. Save the project to keep it.`
    : `Created the track “${result.track.name}” and linked ${short} to it. Save the project to keep it.`;
}

// One chapter's row. It owns only the pending pick, as MappingConfirm does: the confirmed link is the table's, re-read after each call.
// The select opens on "Choose a track" and the check waits for a pick (R3EN2-1); Open in Editing, Open in Proof and Editing check sit in
// the row's More actions menu so the row keeps one line of controls (ENX-3, ENX-5).
function ChapterLinkRow({
  row,
  tracks,
  mappings,
  busy,
  creating,
  createLocked,
  onCreate,
  onConfirm,
  onRecheck,
  onClear,
  onEditingCheck,
}: {
  row: ChapterTrackRow;
  tracks: Track[];
  mappings: TrackMapping[];
  busy: boolean;
  creating: boolean;
  /** Another chapter's create is in flight: this row's button is off until it ends (walkthrough F1). */
  createLocked: boolean;
  onCreate: () => void;
  onConfirm: (trackGuid: string) => void;
  /** Confirm pressed on the track the chapter is already linked to: reads again and says what it found. */
  onRecheck: () => Promise<'found' | 'gone' | 'failed'>;
  onClear: () => void;
  onEditingCheck: () => void;
}) {
  const navigate = useNavigate();
  const linkedGuid = row.mapping?.trackGuid;
  const hasLink = Boolean(linkedGuid);
  const [picking, setPicking] = useState(!hasLink);
  const [rechecking, setRechecking] = useState(false);
  const [chosen, setChosen] = useState(linkedGuid && tracks.some((track) => track.guid === linkedGuid) ? linkedGuid : '');
  // The pick as it is now, for a re-read that ends after the narrator picked something else: their pick is kept, not snapped back.
  const chosenNow = useRef(chosen);
  chosenNow.current = chosen;
  // A confirm or clear comes back as a new link from the table's read: drop back to the read view, as MappingConfirm does.
  // When the row's buttons last swapped (a link appeared, Change, Cancel): the next control sits in the same spot, so a fast second click of a
  // double click would press it. Change, Clear and Cancel ignore a press that soon, as Create does (CREATE_QUIET_MS).
  const swappedAt = useRef(0);
  const settled = () => Date.now() - swappedAt.current >= CREATE_QUIET_MS;
  const linkedGuidIfThere = linkedGuid && tracks.some((track) => track.guid === linkedGuid) ? linkedGuid : '';
  const first = useRef(true);
  useEffect(() => {
    setPicking(!hasLink);
    // The pick follows the link: a cleared row has none, and a new link starts the next Change from itself.
    setChosen(linkedGuidIfThere);
    if (!first.current) swappedAt.current = Date.now();
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tracks` only validates the link; a read of the tracks must not reset a pick in progress.
  }, [hasLink, linkedGuid]);

  const name = headingName(row.chapter);
  // In a Voice folders project a chapter's link is its folder, named with how many voices it holds.
  const folders = useVoiceLayout() === 'folders';
  const linkedTrack = tracks.find((track) => track.guid === linkedGuid);
  const linkedName = folders && linkedTrack?.isFolder ? folderLinkLabel(row.trackName ?? '', folderChildren(tracks, linkedTrack.guid).length) : row.trackName;
  const short = chapterName(row.chapter, 'short');
  // The linked track, and the voices inside it when the link is a folder, each with items the app cannot play.
  const unplayable = linkedTrack
    ? [linkedTrack, ...folderChildren(tracks, linkedTrack.guid)].some((track) => track.items.some((item) => !item.supported || !item.sourceAvailable))
    : false;
  const choices = plainTrackChoices(tracks, mappings, row.chapter.id);
  const badge = STATE_BADGE[row.state];
  const showPicker = picking && choices.length > 0;
  // Only a chapter with no link at all gets a new track: a missing one keeps Change and Clear, and a Change picks among the tracks.
  const createButton = !hasLink && (
    <IconButton
      size="sm"
      action={folders ? 'createChapterFolder' : 'createChapterTrack'}
      label={`Create a ${folders ? 'folder' : 'track'} for ${short}`}
      pending={creating}
      disabledReason={createLocked ? 'Wait for the track being added' : busy && !creating ? 'Wait for the change in progress' : undefined}
      onClick={() => {
        // A double click on Clear lands its second press here, where Create now is: ignore it, Create adds a track in REAPER.
        if (settled()) onCreate();
      }}
    />
  );
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
          <TrackSelect label={`${folders ? 'Folder' : 'Track'} for ${short}`} choices={choices} value={chosen} onChange={setChosen} fullWidth />
        ) : picking ? (
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No REAPER tracks to link
          </span>
        ) : row.trackName ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate" title={linkedName}>
              <bdi>{linkedName}</bdi>
            </span>
            {unplayable && (
              // A chapter is never silently linked to a track whose audio cannot play: a missing source file or an item that is not audio.
              <TooltipTarget text={UNPLAYABLE}>
                {/* tabIndex: TooltipTarget only makes a disabled child focusable, and the reason must reach the keyboard too. */}
                <span role="img" aria-label={UNPLAYABLE} tabIndex={0} className="flex-none" style={{ color: 'var(--warn-text)' }}>
                  <Icon name="problem" />
                </span>
              </TooltipTarget>
            )}
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
              <IconButton
                action="confirmTrack"
                label={chosen && chosen === linkedGuid ? `Check the link for ${short} again` : `Use this ${folders ? 'folder' : 'track'} for ${short}`}
                // Primary means a change will be saved: the linked track again only re-reads, so it stays plain.
                variant={chosen && chosen !== linkedGuid ? 'primary' : 'default'}
                disabledReason={!chosen ? 'Choose a track first' : creating ? 'Wait for the track being added' : undefined}
                pending={(busy && !creating) || rechecking}
                onClick={() => {
                  if (chosen !== linkedGuid) return onConfirm(chosen);
                  // The same track again: not a change, so read it again and report, then leave the picker.
                  const pressed = chosen;
                  setRechecking(true);
                  void onRecheck().then((result) => {
                    setRechecking(false);
                    // A pick made while it read stays as it is, in the picker.
                    if (chosenNow.current !== pressed) return;
                    if (result === 'gone') setChosen('');
                    if (result === 'found') {
                      // Change takes the check's place: a double click's second press must not reopen the picker.
                      swappedAt.current = Date.now();
                      setPicking(false);
                    }
                  });
                }}
              />
              {createButton}
              {hasLink && (
                <IconButton
                  action="cancelEdit"
                  disabledReason={busy ? 'Saving the link' : rechecking ? 'Reading the link again' : undefined}
                  onClick={() => {
                    // Cancel drops the abandoned pick: the next Change opens on the linked track, not on it.
                    if (settled()) {
                      setChosen(linkedGuidIfThere);
                      swappedAt.current = Date.now();
                      setPicking(false);
                    }
                  }}
                />
              )}
            </>
          ) : hasLink ? (
            <>
              <IconButton
                action="changeTrack"
                label={`Change the track for ${short}`}
                disabledReason={busy ? 'Saving the link' : undefined}
                onClick={() => {
                  // A double click on the check lands its second press here, where Change now is: ignore it, as Create does (CREATE_QUIET_MS).
                  if (settled()) {
                    swappedAt.current = Date.now();
                    setPicking(true);
                  }
                }}
              />
              <IconButton
                action="clearLink"
                label={`Clear the link for ${short}`}
                pending={busy}
                onClick={() => {
                  // A double click on Cancel lands its second press here: ignore it, a cleared link is not an undo.
                  if (settled()) onClear();
                }}
              />
            </>
          ) : (
            createButton
          )}
          <Menu render={<IconButton action="moreActions" label={`More actions for ${short}`} />} items={menu}>
            {null}
          </Menu>
        </span>
      </TableCell>
    </TableRow>
  );
}
