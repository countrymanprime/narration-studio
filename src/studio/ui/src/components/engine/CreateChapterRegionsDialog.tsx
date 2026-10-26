import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { useCapability } from '../../useCapability';
import { Button } from '../primitives/Button';
import { CapabilityGate } from '../primitives/CapabilityGate';
import { Checkbox } from '../primitives/Checkbox';
import { Dialog } from '../primitives/Dialog';
import { FIELD_LABEL_CLASSES } from '../primitives/Field';
import { SectionLabel } from '../primitives/SectionLabel';
import { Select } from '../primitives/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { formatDuration } from '../proof/format';
import { ToolResult } from './ToolResult';
import type { ChapterRegionPlan, ChapterRegionState, ChapterRegionsCreated, Track } from '../../types';

const REGION_STATE_LABEL: Record<ChapterRegionState, string> = {
  new: 'New region',
  exists: 'Already exists',
  moves: 'Moves an existing region',
  ambiguous: 'Several regions share this title',
};

const REGION_COLUMNS = ['auto', '10rem', '5rem', '5rem', '11rem'] as const;

/** "Sent 2: 2 created." The counts that are not zero, so four zeros no longer pad the sentence (R3EN1-3). */
export function createdText(created: ChapterRegionsCreated): string {
  const parts = [
    [created.created, 'created'],
    [created.existing, 'already existed'],
    [created.updated, 'moved'],
    [created.ambiguous, 'ambiguous'],
    [created.invalid, 'invalid'],
    [created.failed, 'failed'],
  ] as const;
  const said = parts.filter(([count]) => count > 0).map(([count, what]) => `${count} ${what}`);
  return `Sent ${created.sent}${said.length > 0 ? `: ${said.join(', ')}` : ''}.`;
}

/** The chapters left out of the plan, one entry per reason in the order they first appear. */
function skippedByReason(skipped: ChapterRegionPlan['skipped']): { reason: string; titles: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const skip of skipped) groups.set(skip.reason, [...(groups.get(skip.reason) ?? []), skip.title]);
  return [...groups].map(([reason, titles]) => ({ reason, titles }));
}

function CreditsPicker({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className={FIELD_LABEL_CLASSES}>{label}</span>
      <Select label={label} value={value} onChange={onChange} options={options} disabled={disabled} fullWidth className="mt-2" />
    </label>
  );
}

/** Chapter regions. Plans one REAPER region per chapter with a confirmed track link (the "Link chapters…" flow), plus the opening/closing credits tracks chosen below, and writes them to the saved
 * project in one undo step (`ChapterRegionsCreate`, already wired to `dawport.RegionWriter` via the DAW port
 * resolver). Reachable from the audio engine panel next to "Link chapters…" and "Prepare chapter render…", not
 * a new nav item. Styled after LinkChaptersDialog.tsx: both preview a REAPER write derived from the same confirmed
 * chapter links before gating the primary action on the preview's readiness, over the same Table/Select primitives. */
export function CreateChapterRegionsDialog({ tracks, onClose }: { tracks: Track[]; onClose: () => void }) {
  const api = useApi();
  const regionsCapability = useCapability('regions');
  const [openingTrackGuid, setOpeningTrackGuid] = useState('');
  const [closingTrackGuid, setClosingTrackGuid] = useState('');
  const [update, setUpdate] = useState(false);
  const [plan, setPlan] = useState<ChapterRegionPlan | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ChapterRegionsCreated | null>(null);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    let active = true;
    setPreviewError('');
    void api
      .chapterRegionsPreview(openingTrackGuid, closingTrackGuid)
      .then((next) => {
        if (active) setPlan(next);
      })
      .catch((reason: unknown) => {
        if (active) setPreviewError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [api, openingTrackGuid, closingTrackGuid]);

  const trackOptions = [{ value: '', label: 'None' }, ...tracks.map((track) => ({ value: track.guid, label: track.name || `Track ${track.index + 1}` }))];
  const rows = plan?.rows ?? [];
  const canCreate = plan !== null && plan.project === 'ready' && rows.length > 0 && !creating;

  const create = () => {
    setCreateError('');
    setCreating(true);
    api
      .chapterRegionsCreate(openingTrackGuid, closingTrackGuid, update)
      .then((result) => {
        setCreated(result);
        // A second preview shows the rows this run just wrote as "exists" - the same idempotence create_regions itself guarantees.
        // A failed refresh only leaves the pre-create preview in place; the created counts above already answer whether the write worked.
        api
          .chapterRegionsPreview(openingTrackGuid, closingTrackGuid)
          .then(setPlan)
          .catch(() => {});
      })
      .catch((reason: unknown) => setCreateError(String(reason)))
      .finally(() => setCreating(false));
  };

  return (
    <Dialog
      dismissOnOutsidePress={false}
      title="Create chapter regions"
      size="wide"
      onClose={creating ? undefined : onClose}
      escapeCloses={!creating}
      description="Plan one REAPER region per chapter with a confirmed track link, plus the opening and closing credits tracks you choose below. Nothing is written until you create them."
      actions={
        <>
          <Button variant={created ? 'primary' : 'secondary'} onClick={onClose} disabled={creating}>
            {created ? 'Close' : 'Cancel'}
          </Button>
          <CapabilityGate capability={regionsCapability}>
            {/* After a run Close is the next step, so the primary goes quiet until the plan changes (ENX-28). */}
            <Button variant={created ? 'secondary' : 'primary'} onClick={create} disabled={!canCreate} pending={creating}>
              {`Create ${rows.length} region${rows.length === 1 ? '' : 's'}`}
            </Button>
          </CapabilityGate>
        </>
      }
    >
      {/* Each credits track picker says which it is above it (ENX-19). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CreditsPicker label="Opening credits track" value={openingTrackGuid} onChange={setOpeningTrackGuid} options={trackOptions} disabled={creating} />
        <CreditsPicker label="Closing credits track" value={closingTrackGuid} onChange={setClosingTrackGuid} options={trackOptions} disabled={creating} />
      </div>

      {previewError && (
        <div className="mt-3">
          <ToolResult tone="danger" message={previewError} />
        </div>
      )}

      {plan && plan.project !== 'ready' && !previewError && (
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          {plan.message}
        </p>
      )}

      {plan && plan.project === 'ready' && (
        <>
          {/* The option that changes what gets written sits above the table, never below the fold (R3EN1-2). */}
          <div className="mt-3">
            <Checkbox checked={update} onChange={setUpdate} disabled={creating}>
              Move an existing region that shares a chapter&rsquo;s title, instead of adding a second one
            </Checkbox>
          </div>

          <Table label="Chapter regions" className="mt-3" columns={REGION_COLUMNS}>
            <TableHead sticky>
              <TableRow>
                <TableHeader>Region</TableHeader>
                <TableHeader>Track</TableHeader>
                <TableHeader align="right">Start</TableHeader>
                <TableHeader align="right">End</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.kind}-${row.chapterId || row.trackGuid}`}>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.trackName}</TableCell>
                  <TableCell numeric>{formatDuration(row.start)}</TableCell>
                  <TableCell numeric>{formatDuration(row.end)}</TableCell>
                  <TableCell>{REGION_STATE_LABEL[row.state]}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} style={{ color: 'var(--text-muted)' }}>
                    No chapter or credits track is ready for a region yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {plan.skipped.length > 0 && (
            <section aria-labelledby="not-planned-heading" className="mt-4 space-y-1 border-t pt-3 text-sm" style={{ borderColor: 'var(--border)' }}>
              <SectionLabel as="h3" id="not-planned-heading">
                Not planned ({plan.skipped.length})
              </SectionLabel>
              {/* One line per reason, naming its chapters, instead of the same sentence once per chapter. */}
              <ul className="space-y-1">
                {skippedByReason(plan.skipped).map((group) => (
                  <li key={group.reason}>
                    <span style={{ color: 'var(--text-muted)' }}>{group.reason}</span> {group.titles.join(', ')}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {createError && (
        <div className="mt-3">
          <ToolResult tone="danger" message={createError} />
        </div>
      )}

      {created && (
        <div className="mt-3">
          <ToolResult tone={created.failed > 0 || created.ambiguous > 0 || created.invalid > 0 ? 'warning' : 'success'} message={createdText(created)} />
        </div>
      )}
    </Dialog>
  );
}
