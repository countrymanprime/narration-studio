import { headingName } from '../../chapterHeading';
import { useEffect, useMemo, useState } from 'react';
import { creditsKindOfId } from '../credits/creditsEntries';
import { chapterName } from '../../chapterName';
import { useApi } from '../../api/ApiContext';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Dialog } from '../primitives/Dialog';
import { SectionLabel } from '../primitives/SectionLabel';
import { Select } from '../primitives/Select';
import { StatusBadge, type StatusTone } from '../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { ToolResult } from './ToolResult';
import type { ChapterTrackRow } from './chapterTrackRows';
import type { ChapterLinks } from './useChapterLinks';
import type { LineIdentityLine, LineIdentityRowStatus, LineIdentityState, LineIdentityStampRow, Track } from '../../types';

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

/** Every item on a linked chapter's track, stamped with that chapter's identity (chapter-level granularity). The opening and closing credits are
 * linked here but not stamped: they are not in the manuscript, so a stamp with their id would read back as a chapter that is no longer in it. */
function stampRows(rows: ChapterTrackRow[], tracks: Track[]): LineIdentityStampRow[] {
  const byGuid = new Map(tracks.map((track) => [track.guid, track]));
  const stamped: LineIdentityStampRow[] = [];
  for (const { chapter, mapping, state } of rows) {
    const track = mapping && state === 'linked' && !creditsKindOfId(chapter.id) ? byGuid.get(mapping.trackGuid) : undefined;
    for (const item of track?.items ?? []) stamped.push({ itemGuid: item.guid, lineId: chapter.id, text: chapter.title });
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
        <span className="block truncate">{line.entityId || line.lineId}</span>
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
function CurrentStamps({ state, error, onRead, pending }: { state: LineIdentityState; error: string; onRead: () => void; pending: boolean }) {
  return (
    <section aria-labelledby="current-stamps-heading" className="mt-4 space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      {/* The heading and its button wrap as a pair at a narrow width rather than squeezing the button's label (R3EN2-17). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel as="h3" id="current-stamps-heading">
          Currently stamped in REAPER
        </SectionLabel>
        <Button variant="secondary" onClick={onRead} pending={pending}>
          Read current stamps
        </Button>
      </div>
      {(state.phase === 'reading' || (state.phase === 'success' && state.linesRead > 0)) && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {state.message}
        </p>
      )}
      {error && <ToolResult tone="danger" message={error} />}
      {state.lines.length > 0 && (
        <Table label="Stamped lines" columns={STAMPED_COLUMNS}>
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
      {state.phase === 'success' && state.lines.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Nothing is stamped yet.
        </p>
      )}
    </section>
  );
}

export function LinkChaptersDialog({ links, onClose }: { links: ChapterLinks; onClose: () => void }) {
  const api = useApi();
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

  const failure = requestError || (state.phase === 'error' ? state.message : '');
  const stampError = lastAction === 'stamp' ? failure : '';
  const readError = lastAction === 'read' ? failure : '';

  const preview = useMemo(() => stampRows(rows, tracks), [rows, tracks]);
  const running = state.phase === 'stamping';
  const trackOptions = [{ value: '', label: 'Not linked' }, ...tracks.map((track) => ({ value: track.guid, label: track.name || `Track ${track.index + 1}` }))];

  const approve = () => {
    setLastAction('stamp');
    setRequestError('');
    api.lineIdentityStamp(preview, overwrite).catch((reason: unknown) => setRequestError(String(reason)));
  };
  const read = () => {
    setLastAction('read');
    setRequestError('');
    api.lineIdentityRead().catch((reason: unknown) => setRequestError(String(reason)));
  };

  return (
    <Dialog
      dismissOnOutsidePress={false}
      title="Link chapters to REAPER"
      size="wide"
      onClose={running ? undefined : onClose}
      escapeCloses={!running}
      description="Choose which REAPER track holds each chapter's recording. Every item on a linked track will be stamped with that chapter's identity; nothing is written until you approve."
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={running}>
            {state.phase === 'success' && state.stamp.applied > 0 ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={approve} disabled={preview.length === 0} pending={running}>
            {`Stamp ${preview.length} item${preview.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
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
      {state.phase === 'stamping' && (
        <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          {state.message}
        </p>
      )}
      {state.phase === 'success' && (state.stamp.applied > 0 || state.stamp.missingCount > 0 || state.stamp.conflictsCount > 0) && (
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
            <TableHeader align="right" className="whitespace-nowrap">
              To stamp
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(({ chapter, mapping, state }) => {
            const track = state === 'linked' ? tracks.find((candidate) => candidate.guid === mapping?.trackGuid) : undefined;
            // A link whose track is gone is shown as the section shows it, not as "Not linked".
            const options = state === 'missing_track' && mapping ? [...trackOptions, { value: mapping.trackGuid, label: 'Track missing' }] : trackOptions;
            return (
              <TableRow key={chapter.id}>
                <TableCell>{headingName(chapter)}</TableCell>
                <TableCell>
                  <Select
                    label={`Track for ${chapterName(chapter, 'short')}`}
                    value={mapping?.trackGuid ?? ''}
                    onChange={(value) => (value ? links.set(chapter.id, value) : links.unlink(chapter.id))}
                    options={options}
                    disabled={links.busyChapterId === chapter.id}
                    fullWidth
                  />
                </TableCell>
                <TableCell numeric>{track && !creditsKindOfId(chapter.id) ? track.items.length : '–'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-3">
        <Checkbox checked={overwrite} onChange={setOverwrite} disabled={running}>
          Overwrite items already stamped with a different chapter
        </Checkbox>
      </div>

      <CurrentStamps state={state} error={readError} onRead={read} pending={state.phase === 'reading'} />
    </Dialog>
  );
}
