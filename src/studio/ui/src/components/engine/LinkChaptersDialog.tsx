import { apiErrorMessage } from '../../api/errorMessage';
import { headingName } from '../../chapterHeading';
import { useEffect, useMemo, useRef, useState } from 'react';
import { creditsKindOfId } from '../credits/creditsEntries';
import { chapterName } from '../../chapterName';
import { useApi } from '../../api/ApiContext';
import { chapterItemsByNearestLink, chapterTrackOf } from '../../api/chapterTrackItems';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Checkbox } from '../primitives/Checkbox';
import { Dialog } from '../primitives/Dialog';
import { SectionLabel } from '../primitives/SectionLabel';
import { Select } from '../primitives/Select';
import { StatusBadge, type StatusTone } from '../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { ToolResult } from './ToolResult';
import { LiveTracksRefresh, LiveTracksStatus } from './LiveTracksStatus';
import type { LiveTracks } from './useLiveTracks';
import type { ChapterTrackRow } from './chapterTrackRows';
import type { ChapterLinks } from './useChapterLinks';
import { folderChildren, folderLinkLabel } from './voices';
import { useVoiceLayout } from './voiceLayout';
import type { LineIdentityLine, LineIdentityRowStatus, LineIdentityState, LineIdentityStampRow, Track, TrackItem } from '../../types';
import { plural } from '../../plural';
import { trackName } from '../tracks/trackName';
import { LINK_STATE_LABEL } from '../chapterTracks/chapterLink';
import { heldLabel, holderName } from '../mapping/trackChoices';

const STATUS_LABEL: Record<LineIdentityRowStatus, string> = {
  ok: 'OK',
  drift: 'Text changed since stamping',
  'stale-source': 'Manuscript re-imported since stamping',
  removed: 'Chapter no longer in the manuscript',
  unrecognized: 'From an older stamp scheme',
  unknown: 'No manuscript loaded to compare against',
};

const STATUS_TONE: Record<LineIdentityRowStatus, StatusTone> = {
  ok: 'success',
  drift: 'warning',
  'stale-source': 'warning',
  removed: 'danger',
  unrecognized: 'neutral',
  unknown: 'neutral',
};

// Fixed columns (alignment audit ENX-17, ENX-18): the track picker sits beside its chapter at one x, and a stamped line's GUID and
// entity keep to one line (a GUID cut short keeps the whole one as its title) while the text column takes what is left.
const MAPPING_COLUMNS = ['auto', '13rem', '6rem'] as const;
const STAMPED_COLUMNS = ['15rem', '5.5rem', '13rem', 'auto'] as const;

/** The items each linked chapter owns (chapterItemsByNearestLink), so an item under two linked tracks is counted and stamped for the nearer one. The
 * opening and closing credits are linked here but own nothing: they are not in the manuscript, so a stamp with their id would read back as a
 * chapter that is no longer in it. */
function itemsOwnedByChapter(rows: ChapterTrackRow[], tracks: Track[]): Map<string, TrackItem[]> {
  const links = new Map<string, string>();
  for (const { chapter, mapping, state } of rows) {
    if (mapping && (state === 'linked' || state === 'several') && !creditsKindOfId(chapter.id)) links.set(chapter.id, mapping.trackGuid);
  }
  return chapterItemsByNearestLink(tracks, links);
}

/** Every item a linked chapter owns, stamped with that chapter's identity (chapter-level granularity). */
function stampRows(rows: ChapterTrackRow[], owned: Map<string, TrackItem[]>): LineIdentityStampRow[] {
  const stamped: LineIdentityStampRow[] = [];
  for (const { chapter } of rows) {
    for (const item of owned.get(chapter.id) ?? []) stamped.push({ itemGuid: item.guid, lineId: chapter.id, text: chapter.title });
  }
  return stamped;
}

function LineStatusRow({ line }: { line: LineIdentityLine }) {
  return (
    <TableRow>
      <TableCell className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-xs whitespace-nowrap">
        <span className="block truncate" title={line.itemGuid}>
          {line.itemGuid}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="block truncate" title={line.entityId || line.lineId}>
          {line.entityId || line.lineId}
        </span>
      </TableCell>
      <TableCell>
        <StatusBadge tone={STATUS_TONE[line.status]} label={STATUS_LABEL[line.status]} />
      </TableCell>
      <TableCell>{line.status === 'drift' ? (line.currentText ?? '') : line.text}</TableCell>
    </TableRow>
  );
}

/** Reads current stamped identity from REAPER and shows every row's status (ok, drift, stale-source, removed, unrecognized,
 * unknown), so a narrator can see what "Link chapters" would change before running it again. */
function CurrentStamps({
  state,
  error,
  onRead,
  pending,
  stamping,
  readFoundNothing,
}: {
  state: LineIdentityState;
  error: string;
  onRead: () => void;
  pending: boolean;
  /** A stamp is running: Read waits, so the second run cannot replace the first's state. */
  stamping: boolean;
  /** The last run was a Read and it found no stamped item. */
  readFoundNothing: boolean;
}) {
  return (
    <section aria-labelledby="current-stamps-heading" className="mt-4 space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      {/* The heading and its button wrap as a pair at a narrow width rather than squeezing the button's label (R3EN2-17). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel as="h3" id="current-stamps-heading">
          Currently stamped in REAPER
        </SectionLabel>
        <IconButton action="readStamps" onClick={onRead} pending={pending} disabled={stamping} />
      </div>
      {(state.phase === 'reading' || (state.phase === 'success' && state.linesRead > 0)) && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {state.message}
        </p>
      )}
      {error && <ToolResult tone="danger" message={error} />}
      {state.lines.length > 0 && (
        <Table label="Stamped items" columns={STAMPED_COLUMNS}>
          <TableHead sticky>
            <TableRow>
              <TableHeader>Item</TableHeader>
              <TableHeader>Entity</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Text</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {state.lines.map((line) => (
              <LineStatusRow key={line.itemGuid} line={line} />
            ))}
          </TableBody>
        </Table>
      )}
      {/* Only after Read: a Stamp finishes in 'success' with no lines read, and the host does not read them back, so "nothing" would be false (#3053). */}
      {readFoundNothing && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Nothing is stamped yet.
        </p>
      )}
    </section>
  );
}

/** `live` is the panel's live track list (#2840): the dialog reads it again when it opens, says whose tracks the pickers list and when they were
 * read, and has its own Refresh, so a track added in REAPER while the dialog is open can be picked without closing it. */
export function LinkChaptersDialog({ links, live, onClose }: { links: ChapterLinks; live?: LiveTracks; onClose: () => void }) {
  const api = useApi();
  // Opening the dialog reads the tracks again through the panel's reader, sharing a read already in flight (breaker 8): a track added in REAPER
  // since the panel's last read is in the pickers.
  const joinOnOpen = useRef(live?.join);
  useEffect(() => joinOnOpen.current?.(), []);
  const { tracks, rows } = links;
  const [overwrite, setOverwrite] = useState(false);
  const [state, setState] = useState<LineIdentityState>({
    phase: 'idle',
    message: '',
    stamp: { applied: 0, unchanged: 0, missingCount: 0, conflictsCount: 0, missing: [], conflicts: [] },
    lines: [],
    linesRead: 0,
  });
  const [requestError, setRequestError] = useState('');
  // Which button the narrator pressed last, so a failure is shown once, beside that action (ENX-22): Stamp's result opens the body,
  // Read's sits under "Currently stamped". A failure with no press behind it (a run already in flight when the dialog opened) is Stamp's.
  const [lastAction, setLastAction] = useState<'stamp' | 'read'>('stamp');

  useEffect(() => {
    const unsubscribe = api.subscribeLineIdentity(setState);
    // Hydrates whatever run was already in flight (opened once, then reopened); the live event follows anyway.
    void api
      .lineIdentityState()
      .then(setState)
      .catch(() => {});
    return unsubscribe;
  }, [api]);

  // The notice is the last takeover's, kept by the shared reader: a dialog opening anew starts without it, so it is never repeated for a change this session did not make.
  const { clearNotice } = links;
  useEffect(() => clearNotice(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const failure = requestError || (state.phase === 'error' ? state.message : '');
  const stampError = lastAction === 'stamp' ? failure : '';
  const readError = lastAction === 'read' ? failure : '';

  const owned = useMemo(() => itemsOwnedByChapter(rows, tracks), [rows, tracks]);
  const preview = useMemo(() => stampRows(rows, owned), [rows, owned]);
  const running = state.phase === 'stamping';
  // A stamp that ended says so even when every item was already stamped (applied 0, unchanged N); a Read ends in success with these all zero.
  const stamped = state.phase === 'success' && state.stamp.applied + state.stamp.unchanged + state.stamp.missingCount + state.stamp.conflictsCount > 0;
  const reading = state.phase === 'reading';
  // A Read ends in success with no stamp counts; a Stamp's success has some, so the empty-read line follows the state, not the last button pressed
  // (a Read refused after a Stamp, or a dialog reopened while a Read ran, keep the state's own meaning).
  const readFoundNothing = state.phase === 'success' && state.lines.length === 0 && state.linesRead === 0 && !stamped && !failure;
  // A name is an option's whole text, so a direction override in it reaches nothing past the name: an option needs no isolate (breaker 7).
  const voiceFolders = useVoiceLayout() === 'folders';
  const trackOptions = [
    { value: '', label: LINK_STATE_LABEL.unlinked },
    ...tracks.map((track) => {
      const name = trackName(track.name, track.index);
      // A folder reads as the Chapter links list names it, so it is not taken for a track.
      return {
        value: track.guid,
        label: track.isFolder ? folderLinkLabel(name, folderChildren(tracks, track.guid).length, voiceFolders ? 'voice' : 'track') : name,
      };
    }),
  ];
  // A folder that holds a track another chapter is linked to still takes the audio outside that track (chapterItemsByNearestLink); the sentence under
  // the table says so once it is picked, where the closed picker's clipped label could not.
  const linkedTo = new Map<string, string>();
  for (const { chapter, mapping, state } of rows) if (mapping && (state === 'linked' || state === 'several')) linkedTo.set(mapping.trackGuid, chapter.id);
  // The chapter that holds a track, named by the manuscript's current heading, as the Chapter links list and the takeover sentence name it (else the kept title, cleaned: holderName); the first holder when several do.
  const holders = new Map<string, { id: string; name: string }>();
  for (const { chapter, mapping, state } of rows) {
    if (mapping && (state === 'linked' || state === 'several') && !holders.has(mapping.trackGuid)) {
      holders.set(mapping.trackGuid, { id: chapter.id, name: holderName(headingName(chapter), mapping.chapterTitle) });
    }
  }
  const sharesTrack = (chapterId: string, folderGuid: string) => {
    const at = tracks.findIndex((track) => track.guid === folderGuid);
    const folder = tracks[at];
    if (!folder?.isFolder) return false;
    const end = tracks.findIndex((track, i) => i > at && track.depth <= folder.depth);
    return tracks.slice(at + 1, end < 0 ? undefined : end).some((track) => linkedTo.has(track.guid) && linkedTo.get(track.guid) !== chapterId);
  };
  const sharing = rows.filter(
    ({ chapter, mapping, state }) => mapping && (state === 'linked' || state === 'several') && sharesTrack(chapter.id, mapping.trackGuid),
  );

  const approve = () => {
    setLastAction('stamp');
    setRequestError('');
    api.lineIdentityStamp(preview, overwrite).catch((reason: unknown) => setRequestError(apiErrorMessage(reason)));
  };
  const read = () => {
    setLastAction('read');
    setRequestError('');
    api.lineIdentityRead().catch((reason: unknown) => setRequestError(apiErrorMessage(reason)));
  };

  return (
    <Dialog
      dismissOnOutsidePress={false}
      title="Link chapters to REAPER"
      size="wide"
      onClose={onClose}
      description="Choose which REAPER track holds each chapter's recording. A pick saves the link at once; nothing is stamped until you approve."
      actions={
        <>
          {/* Always an exit: a stamp that stalls must not trap the narrator. The host keeps stamping and the dialog shows it again on reopen. */}
          <Button variant="secondary" onClick={onClose}>
            {running || stamped ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={approve} disabled={preview.length === 0 || reading} pending={running}>
            {`Stamp ${plural(preview.length, 'item')}`}
          </Button>
        </>
      }
    >
      {live && (
        <div className="mb-3 flex items-center justify-between gap-2 text-[0.8125rem]" style={{ color: 'var(--text-muted)' }}>
          <span className="min-w-0 flex-1">
            <LiveTracksStatus live={live} />
          </span>
          <LiveTracksRefresh live={live} />
        </div>
      )}
      {/* The outcome of Stamp opens the body, where it is seen without scrolling past the chapters (R3EN2-13). */}
      {stampError && (
        <div className="mb-3">
          <ToolResult tone="danger" message={stampError} />
        </div>
      )}
      {links.error && (
        <div className="mb-3">
          <ToolResult tone="danger" message={links.error} />
        </div>
      )}
      {links.notice && (
        <div className="mb-3">
          <ToolResult tone="warning" message={links.notice} />
        </div>
      )}
      {state.phase === 'stamping' && (
        <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          {state.message}
        </p>
      )}
      {stamped && (
        <div className="mb-3">
          <ToolResult tone={state.stamp.missing.length > 0 || state.stamp.conflicts.length > 0 ? 'warning' : 'success'} message={state.message}>
            {state.stamp.missing.length > 0 && <p className="mt-1">Stale items (their GUID no longer resolves in REAPER): {state.stamp.missing.join(', ')}</p>}
            {state.stamp.conflicts.length > 0 && (
              <p className="mt-1">Already stamped with a different chapter, not overwritten: {state.stamp.conflicts.join(', ')}</p>
            )}
          </ToolResult>
        </div>
      )}

      <Table label="Chapter to track mapping" columns={MAPPING_COLUMNS}>
        <TableHead sticky>
          <TableRow>
            <TableHeader>Chapter</TableHeader>
            <TableHeader>REAPER track</TableHeader>
            <TableHeader className="whitespace-nowrap">To stamp</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(({ chapter, mapping, state }) => {
            const count =
              (state === 'linked' || state === 'several') && !creditsKindOfId(chapter.id) && chapterTrackOf(tracks, mapping?.trackGuid)
                ? (owned.get(chapter.id)?.length ?? 0)
                : undefined;
            // A link whose track is gone is shown as the section shows it, not as "Not linked".
            const own = state === 'missing' && mapping ? [...trackOptions, { value: mapping.trackGuid, label: LINK_STATE_LABEL.missing }] : trackOptions;
            // A track another chapter holds says so before the pick, as the Chapter links list and the pickers do; picking it moves it (#3398).
            const options = own.map((option) => {
              const holder = option.value ? holders.get(option.value) : undefined;
              return holder && holder.id !== chapter.id && option.value !== mapping?.trackGuid
                ? { ...option, label: heldLabel(option.label, holder.name) }
                : option;
            });
            return (
              <TableRow key={chapter.id}>
                <TableCell>{headingName(chapter)}</TableCell>
                <TableCell>
                  <Select
                    label={`Track for ${chapterName(chapter, 'short')}`}
                    value={mapping?.trackGuid ?? ''}
                    onChange={(value) => (value ? links.set(chapter.id, value) : links.unlink(chapter.id))}
                    options={options}
                    disabled={links.busyChapterId === chapter.id || running}
                    fullWidth
                  />
                </TableCell>
                <TableCell numeric>{count ?? '–'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {sharing.length > 0 && (
        <div className="mt-3">
          <ToolResult
            tone="warning"
            message={`${sharing.map(({ chapter }) => chapterName(chapter, 'short')).join(', ')}: the folder also holds another chapter's linked track. That track's items stay with its own chapter.`}
          />
        </div>
      )}

      <div className="mt-3">
        <Checkbox checked={overwrite} onChange={setOverwrite} disabled={running}>
          Overwrite items already stamped with a different chapter
        </Checkbox>
      </div>

      <CurrentStamps state={state} error={readError} onRead={read} pending={state.phase === 'reading'} stamping={running} readFoundNothing={readFoundNothing} />
    </Dialog>
  );
}
