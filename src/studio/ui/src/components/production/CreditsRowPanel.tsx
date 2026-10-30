import { Link } from 'react-router-dom';
import type { ChapterStatus } from '../../types';
import { STATUS_LABELS, STATUS_ORDER } from '../../chapterStatus';
import { Button } from '../primitives/Button';
import { HIT_AREA } from '../primitives/hitArea';
import { SectionLabel } from '../primitives/SectionLabel';
import { Select } from '../primitives/Select';
import { SlideOver } from '../primitives/SlideOver';
import { formatLength } from './productionFormat';
import type { CreditsRow } from '../credits/useCreditsRows';
import { addressPath } from '../../navigation/address';

const MUTED = { color: 'var(--text-muted)' };

// Why a row has no Recorded length, in the panel's own words (mirrors productionFormat.ts's UNRECORDED, actual-
// 's reasons).
const UNRECORDED_TEXT: Record<NonNullable<CreditsRow['recordedUnavailable']>, string> = {
  unlinked: 'No track linked yet',
  multiple_tracks: 'Linked to more than one track',
  track_missing: 'Linked track is missing',
  no_project: 'No REAPER project open',
};

// Credits run well under a minute, so seconds are shown below one.
const creditsLength = (seconds: number) => (seconds < 60 ? `${Math.round(seconds)}s` : `${Math.round(seconds / 60)}m`);

// A single unresolved token reads as its own name; several as a count and list.
const unresolvedWarning = (unresolved: string[]): string | undefined => {
  if (unresolved.length === 0) return undefined;
  if (unresolved.length === 1) return `${unresolved[0]} not filled in`;
  return `${unresolved.length} tokens not filled in: ${unresolved.join(', ')}`;
};

/**
 * An Opening or Closing credits row's slide-over on the Production board (a kind with no template has no row, so there is always one): its template, words and estimated length, the
 * tokens still to fill in, and its status. The credits are chapters of the board; this panel holds what only they have.
 */
export function CreditsRowPanel({
  open,
  row,
  label,
  onStatus,
  onCheck,
  onClose,
}: {
  open: boolean;
  row: CreditsRow;
  label: string;
  onStatus: (status: ChapterStatus) => void;
  /** Opens the same recording-check dialog a chapter row's Record cell opens, for this
   * credits chapter. */
  onCheck: () => void;
  onClose: () => void;
}) {
  const warning = unresolvedWarning(row.unresolved);
  return (
    <SlideOver open={open} title={label} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p>
          <span className="font-semibold">{row.template?.name}</span> · {(row.words ?? 0).toLocaleString()} words ·{' '}
          {/* "about 3s" stays on one line (XPR1-25). */}
          <span className="whitespace-nowrap">about {creditsLength(row.estimatedSeconds ?? 0)}</span>
        </p>
        {warning && (
          // The values are filled in on Settings' Credits section, so the warning says where (R3PR1-10).
          <p role="alert" style={{ color: 'var(--danger-text)' }}>
            {warning}.{' '}
            <Link className={`font-semibold underline ${HIT_AREA}`} to={addressPath({ page: 'settings', anchor: 'credits' })}>
              Fill in under Settings &gt; Credits
            </Link>
          </p>
        )}
        <div className="space-y-1.5">
          <SectionLabel as="div">Status</SectionLabel>
          <Select
            label={`${label} status`}
            value={row.status}
            options={STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABELS[status] }))}
            onChange={(value) => onStatus(value as ChapterStatus)}
          />
        </div>
        <p style={MUTED}>
          Recorded: {row.recordedSeconds === undefined ? UNRECORDED_TEXT[row.recordedUnavailable ?? 'unlinked'] : formatLength(row.recordedSeconds)}
        </p>
        {/* The two ways on, on one row and apart: a link beside the status select touched it (XPR1-25). The check stays offered with no
            track linked, because its refusal is where the row is linked to one. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button variant="secondary" onClick={onCheck}>
            Check recordings…
          </Button>
          <Link className={`font-semibold underline ${HIT_AREA}`} to={addressPath({ page: 'script', credits: row.kind })}>
            Open in Script
          </Link>
        </div>
      </div>
    </SlideOver>
  );
}
